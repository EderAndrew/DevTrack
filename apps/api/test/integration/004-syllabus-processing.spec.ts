import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SyllabusProcessingWorker } from "../../src/modules/syllabus/syllabus-processing.worker";
import { SYLLABUS_WORKER_PATH } from "../../src/modules/syllabus/syllabus-worker-runner";
import {
  createSubject,
  createSyllabusDocument,
  createUser,
  loginAs,
  pooExtraction,
  syllabusFixture,
  type TestUser,
} from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { writeFakeWorker } from "../helpers/syllabus-worker";
import { api, createTestApp, resetDb, type TestApp, type TestAppOptions } from "../helpers/test-app";

const MARKER = "MARCADOR-EMENTA-004";
const MINUTE = 60_000;

const at = (base: Date, ms: number) => new Date(base.getTime() + ms);

/**
 * One capture for every app of this file: nestjs-pino keeps the logger used outside a request
 * (the worker's) from the first app created in the process, so separate captures would miss lines.
 */
const logs = new LogCapture();

afterAll(() => {
  // 004/SC-010: no text of the syllabus in any log line of this file.
  expect(logs.text()).not.toContain(MARKER);
});

/** 004/FR-014, 004/FR-015, contracts/syllabus-processing.md. */
describe("004/FR-014 004/FR-015 processamento assíncrono da ementa", () => {
  let t: TestApp;
  let worker: SyllabusProcessingWorker;

  beforeAll(async () => {
    t = await createTestApp({ logs });
    worker = t.get(SyllabusProcessingWorker);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  const newTeacher = () => createUser(t, { roles: ["TEACHER"] });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const reload = (id: string) => t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id } });

  async function uploaded(fixture = "poo.pdf") {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    return { teacher, subject, document: await createSyllabusDocument(t, subject.id, { fixture }) };
  }

  it("004/FR-014 runOnce leva UPLOADED → PROCESSED(TEXT) com a extração e syllabus.processed (ator SYSTEM)", async () => {
    const { document } = await uploaded("poo.pdf");
    const now = new Date();
    expect(await worker.runOnce(now)).toBe(1);

    const row = await reload(document.id);
    expect(row).toMatchObject({
      processingStatus: "PROCESSED",
      extractionResult: "TEXT",
      extractorVersion: 1,
      attempts: 1,
      leaseExpiresAt: null,
      failureCategory: null,
      processedAt: now,
    });
    expect(row.extraction).toEqual(pooExtraction());

    const [event] = await events("syllabus.processed");
    expect(event).toMatchObject({
      actorType: "SYSTEM",
      actorUserId: null,
      targetType: "SYLLABUS_DOCUMENT",
      targetId: document.id,
      metadata: { result: "TEXT", groupCount: 4, itemCount: 16, attempts: 1, extractorVersion: 1 },
    });
    expect(JSON.stringify(event!.metadata)).not.toContain(MARKER);
    expect(await worker.runOnce(at(now, 10 * MINUTE))).toBe(0);
  });

  it("004/FR-014 DOCX também é processado com a mesma extração", async () => {
    const { document } = await uploaded("poo.docx");
    await worker.runOnce();
    expect((await reload(document.id)).extraction).toEqual(pooExtraction());
  });

  it.each(["ementa.png", "ementa.jpg", "escaneado.pdf"])("004/FR-020 %s → PROCESSED com NO_TEXT e sem extração", async (fixture) => {
    const { document } = await uploaded(fixture);
    await worker.runOnce();
    expect(await reload(document.id)).toMatchObject({ processingStatus: "PROCESSED", extractionResult: "NO_TEXT", extraction: null });
    expect((await events("syllabus.processed"))[0]!.metadata).toEqual({
      result: "NO_TEXT",
      groupCount: 0,
      itemCount: 0,
      attempts: 1,
      extractorVersion: 1,
    });
  });

  it("004/FR-015 arquivo ilegível → FAILED direto (UNREADABLE) com syllabus.processing_failed", async () => {
    const { document } = await uploaded("corrompido.pdf");
    await worker.runOnce();
    expect(await reload(document.id)).toMatchObject({
      processingStatus: "FAILED",
      failureCategory: "UNREADABLE",
      attempts: 1,
      extraction: null,
    });
    const [event] = await events("syllabus.processing_failed");
    expect(event).toMatchObject({ actorType: "SYSTEM", targetId: document.id, metadata: { category: "UNREADABLE", attempts: 1 } });
  });

  it("servidor reiniciado: lease vencido é reservado de novo e processado", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSING" });
    const now = new Date();

    expect(await worker.runOnce(now)).toBe(0); // lease still valid
    expect(await worker.runOnce(at(now, 4 * MINUTE))).toBe(1);
    expect(await reload(document.id)).toMatchObject({ processingStatus: "PROCESSED", attempts: 2 });
  });

  it("lease vencido na última tentativa → FAILED (TIMEOUT) sem nova extração", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSING" });
    await t.prisma.syllabusDocument.update({ where: { id: document.id }, data: { attempts: 3 } });

    await worker.runOnce(at(new Date(), 4 * MINUTE));
    expect(await reload(document.id)).toMatchObject({ processingStatus: "FAILED", failureCategory: "TIMEOUT", attempts: 3 });
    expect((await events("syllabus.processing_failed"))[0]!.metadata).toEqual({ category: "TIMEOUT", attempts: 3 });
  });

  it("004/SC-009 duas runOnce simultâneas processam cada documento uma única vez", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const documents = [
      await createSyllabusDocument(t, subject.id, { fixture: "poo.pdf" }),
      await createSyllabusDocument(t, subject.id, { fixture: "poo.docx" }),
      await createSyllabusDocument(t, subject.id, { fixture: "ementa.png" }),
    ];

    const claimed = await Promise.all([worker.runOnce(), worker.runOnce()]);
    expect(claimed[0]! + claimed[1]!).toBe(3);
    const processed = await events("syllabus.processed");
    expect(processed.map((event) => event.targetId).sort()).toEqual(documents.map((document) => document.id).sort());
    for (const document of documents) expect((await reload(document.id)).attempts).toBe(1);
  });

  it("a extração gravada nunca muda depois", async () => {
    const { document } = await uploaded("poo.pdf");
    await worker.runOnce();
    const before = await reload(document.id);
    await worker.runOnce(at(new Date(), 60 * MINUTE));
    const res = await api(t, { cookie: await loginAs(t, { id: before.uploadedById }) }).post(
      `/api/syllabus-documents/${document.id}/retry`,
    );
    expect(res.status).toBe(409);
    const after = await reload(document.id);
    expect(after.extraction).toEqual(before.extraction);
    expect(after.processedAt).toEqual(before.processedAt);
    expect(await events("syllabus.processed")).toHaveLength(1);
  });

  describe("004/FR-016 Tentar novamente", () => {
    const retry = async (teacher: TestUser, id: string) =>
      api(t, { cookie: await loginAs(t, teacher) }).post(`/api/syllabus-documents/${id}/retry`);

    it("FAILED → 202 UPLOADED com tentativas zeradas; o worker processa de novo", async () => {
      const teacher = await newTeacher();
      const subject = await createSubject(t, teacher.id);
      const document = await createSyllabusDocument(t, subject.id, { status: "FAILED", failureCategory: "TIMEOUT" });

      const res = await retry(teacher, document.id);
      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({ id: document.id, processingStatus: "UPLOADED", attempts: 0, failureCategory: null });
      await worker.runOnce(at(new Date(), 1000));
      expect(await reload(document.id)).toMatchObject({ processingStatus: "PROCESSED", attempts: 1 });
    });

    it.each(["UPLOADED", "PROCESSING", "PROCESSED"] as const)("em %s → 409 INVALID_STATE_TRANSITION", async (status) => {
      const teacher = await newTeacher();
      const subject = await createSubject(t, teacher.id);
      const document = await createSyllabusDocument(t, subject.id, { status });
      const res = await retry(teacher, document.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
      expect((await reload(document.id)).processingStatus).toBe(status);
    });

    it("004/US8-5 11º pedido na mesma hora → 429 com Retry-After", async () => {
      const teacher = await newTeacher();
      const subject = await createSubject(t, teacher.id);
      const document = await createSyllabusDocument(t, subject.id, { status: "FAILED" });
      const client = api(t, { cookie: await loginAs(t, teacher) });
      const statuses: number[] = [];
      for (let index = 0; index < t.config.rateLimit.syllabusRetriesHourly; index++) {
        statuses.push((await client.post(`/api/syllabus-documents/${document.id}/retry`)).status);
      }
      expect(statuses[0]).toBe(202);
      const blocked = await client.post(`/api/syllabus-documents/${document.id}/retry`);
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe("RATE_LIMITED");
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    });
  });
});

describe("004/FR-015 falhas transitórias: novas tentativas em 1 min e 5 min, FAILED na 3ª", () => {
  const cases: [string, "TIMEOUT" | "INTERNAL", () => TestAppOptions][] = [
    [
      "prazo esgotado (1 s)",
      "TIMEOUT",
      () => ({
        config: { syllabus: { maxFileMb: 10, processingIntervalSeconds: 0, processingTimeoutSeconds: 1 } },
        overrides: [{ provide: SYLLABUS_WORKER_PATH, useValue: writeFakeWorker("hang") }],
      }),
    ],
    ["erro interno", "INTERNAL", () => ({ overrides: [{ provide: SYLLABUS_WORKER_PATH, useValue: writeFakeWorker("internal") }] })],
    ["worker que quebra", "INTERNAL", () => ({ overrides: [{ provide: SYLLABUS_WORKER_PATH, useValue: writeFakeWorker("crash") }] })],
  ];

  describe.each(cases)("%s", (_name, category, options) => {
    let t: TestApp;

    beforeAll(async () => {
      t = await createTestApp({ ...options(), logs });
      await resetDb(t.prisma);
    });
    afterAll(() => t.close());

    it(`${category}: UPLOADED de novo após 1 min e 5 min, FAILED na 3ª tentativa`, async () => {
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const subject = await createSubject(t, teacher.id);
      const document = await createSyllabusDocument(t, subject.id);
      const worker = t.get(SyllabusProcessingWorker);
      logs.clear();
      const reload = () => t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: document.id } });
      const now = new Date();

      expect(await worker.runOnce(now)).toBe(1);
      expect(await reload()).toMatchObject({ processingStatus: "UPLOADED", attempts: 1, nextAttemptAt: at(now, MINUTE) });
      expect(await worker.runOnce(at(now, MINUTE - 1000))).toBe(0);

      expect(await worker.runOnce(at(now, MINUTE))).toBe(1);
      expect(await reload()).toMatchObject({ processingStatus: "UPLOADED", attempts: 2, nextAttemptAt: at(now, 6 * MINUTE) });

      expect(await worker.runOnce(at(now, 6 * MINUTE))).toBe(1);
      expect(await reload()).toMatchObject({ processingStatus: "FAILED", attempts: 3, failureCategory: category, extraction: null });

      const failed = await t.prisma.auditEvent.findMany({ where: { type: "syllabus.processing_failed" } });
      expect(failed.map((event) => event.metadata)).toEqual([{ category, attempts: 3 }]);
      const retries = logs.lines().filter((line) => line.msg === "syllabus.processing_retry");
      expect(retries.map((line) => [line.attempt, line.category])).toEqual([
        [1, category],
        [2, category],
      ]);
      if (category === "TIMEOUT") expect(logs.lines().some((line) => line.msg === "syllabus.worker_timeout")).toBe(true);
    });
  });
});

describe("004/FR-015 kill switch e disparo depois do envio", () => {
  const upload = async (t: TestApp) => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id);
    const res = await api(t, { cookie: await loginAs(t, teacher) }).upload(`/api/subjects/${subject.id}/syllabus-documents`, {
      bytes: syllabusFixture("poo.pdf"),
      filename: "poo.pdf",
      contentType: "application/pdf",
    });
    expect(res.status).toBe(201);
    return res.body.document.id as string;
  };
  const statusAfter = async (t: TestApp, id: string, waitMs: number, until?: string) => {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const row = await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id } });
      if (row.processingStatus === until || Date.now() >= deadline) return row.processingStatus;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  it("SYLLABUS_PROCESSING_INTERVAL_SECONDS=0: o envio é aceito e fica UPLOADED; nem o kick() processa", async () => {
    const t = await createTestApp({ logs });
    try {
      await resetDb(t.prisma);
      expect(t.config.syllabus.processingIntervalSeconds).toBe(0);
      const id = await upload(t);
      expect(await statusAfter(t, id, 1500)).toBe("UPLOADED");
    } finally {
      await t.close();
    }
  });

  it("com o processamento ligado, o envio dispara o worker sem esperar o intervalo", async () => {
    const t = await createTestApp({ logs, config: { syllabus: { maxFileMb: 10, processingIntervalSeconds: 3600, processingTimeoutSeconds: 120 } } });
    try {
      await resetDb(t.prisma);
      const id = await upload(t);
      expect(await statusAfter(t, id, 15_000, "PROCESSED")).toBe("PROCESSED");
    } finally {
      await t.close();
    }
  });
});
