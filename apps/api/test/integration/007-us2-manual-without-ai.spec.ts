import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { fakeDelay, fakeError, fakeOutput } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import {
  createCurriculumAiApp,
  getCurriculumAiStatus,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
  TEST_CURRICULUM_MODEL_CONFIG,
} from "../helpers/curriculum-ai";
import { createSyllabusDocument, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const CALL_TIMEOUT_MS = 200;

/** The 004 manual flow: "Preencher manualmente", edit and confirm (FR-022 of 004). */
async function fillManually(t: TestApp, cookie: string, documentId: string) {
  const client = api(t, { cookie });
  const draft = await client.post(`/api/syllabus-documents/${documentId}/revisions`, { source: "MANUAL" });
  expect(draft.status).toBe(201);
  const saved = await client.put(`/api/syllabus-revisions/${draft.body.id}`, {
    title: "Programação Orientada a Objetos",
    syllabusText: "Ementa escrita à mão pelo professor.",
    competencyText: null,
    groups: [{ title: "Unidade 1", items: [{ text: "Classes e objetos" }, { text: "Herança" }] }],
  });
  expect(saved.status).toBe(200);
  const confirmed = await client.post(`/api/syllabus-revisions/${draft.body.id}/confirm`, {});
  expect(confirmed.status).toBe(200);
  expect(confirmed.body).toMatchObject({ status: "CONFIRMED", source: "MANUAL", aiProposalId: null });
  return confirmed.body as { id: string };
}

/** Every revision of the document with its groups and items, in a stable order. */
function syllabusSnapshot(t: TestApp, documentId: string) {
  return t.prisma.syllabusRevision.findMany({
    where: { documentId },
    orderBy: { id: "asc" },
    include: { groups: { orderBy: { position: "asc" }, include: { items: { orderBy: { position: "asc" } } } } },
  });
}

describe("007/US2 o preenchimento manual continua funcionando, com ou sem IA", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let admin: TestUser;
  let document: SyllabusDocument;

  beforeAll(async () => {
    const base = testConfig().ai;
    t = await createCurriculumAiApp({ config: { ai: { ...base, limits: { ...base.limits, modelCallTimeoutMs: CALL_TIMEOUT_MS } } } });
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    admin = await createUser(t, { roles: ["ADMIN"] });
    cookie = await loginAs(t, teacher);
    ({ document } = await seedProcessedDocument(t, teacher.id));
  });

  const adminClient = async () => api(t, { cookie: await loginAs(t, admin) });

  /** Runs one analysis to its final status and returns the execution row. */
  const analyse = async () => {
    const res = await requestAnalysis(t, cookie, document.id);
    expect(res.status).toBe(202);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.execution.id }, include: { proposal: true } });
  };

  describe("007/US2-1 007/SC-007 a 004 funciona sem diferença quando a IA falha ou está parada", () => {
    it("provedor UNAVAILABLE: a análise falha e o preenchimento manual cria, edita e confirma", async () => {
      t.provider.script(fakeError("UNAVAILABLE"));
      expect((await analyse()).status).toBe("FAILED");
      await fillManually(t, cookie, document.id);
    });

    it("IA pausada (AI_EXECUTION_INTERVAL_SECONDS = 0): status PAUSED e o preenchimento manual funciona", async () => {
      expect(t.config.ai.intervalSeconds).toBe(0);
      expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("PAUSED");
      await fillManually(t, cookie, document.id);
    });
  });

  describe("007/US2-2 007/FR-040 a indisponibilidade aparece com a razão, e o pedido é recusado sem execução", () => {
    it("agente desabilitado pelo administrador → AGENT_DISABLED e 409 AI_AGENT_DISABLED", async () => {
      expect((await (await adminClient()).post("/api/ai/operations/agents/curriculum-agent/status", { status: "DISABLED" })).status).toBe(200);
      expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("AGENT_DISABLED");
      const res = await requestAnalysis(t, cookie, document.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("AI_AGENT_DISABLED");
      expect(await t.prisma.aiExecution.count()).toBe(0);
      await fillManually(t, cookie, document.id);
    });

    it("modelo desabilitado pelo administrador → MODEL_UNAVAILABLE e 503 AI_MODEL_UNAVAILABLE", async () => {
      const res = await (await adminClient()).post(`/api/ai/operations/model-configs/${TEST_CURRICULUM_MODEL_CONFIG.key}/status`, { status: "DISABLED" });
      expect(res.status).toBe(200);
      expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("MODEL_UNAVAILABLE");
      const request = await requestAnalysis(t, cookie, document.id);
      expect(request.status).toBe(503);
      expect(request.body.code).toBe("AI_MODEL_UNAVAILABLE");
      expect(await t.prisma.aiExecution.count()).toBe(0);
    });
  });

  describe("007/US2-3 falhas do provedor terminam num estado final, sem mensagem do provedor", () => {
    it("UNAVAILABLE depois das novas tentativas → FAILED AI_PROVIDER_ERROR", async () => {
      t.provider.script(fakeError("UNAVAILABLE"));
      const execution = await analyse();
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_PROVIDER_ERROR", proposal: null });
      expect(t.provider.requests).toHaveLength(t.config.ai.limits.maxRetries + 1);
    });

    it("resposta mais lenta que o limite por chamada → TIMED_OUT AI_TIMEOUT", async () => {
      t.provider.script(fakeDelay(CALL_TIMEOUT_MS * 5, fakeOutput(pooOutput())));
      expect(await analyse()).toMatchObject({ status: "TIMED_OUT", errorCode: "AI_TIMEOUT", proposal: null });
    });

    it("o status e a execução mostram só o código normalizado da 006", async () => {
      t.provider.script(fakeError("UNAVAILABLE"));
      const execution = await analyse();
      const status = await getCurriculumAiStatus(t, cookie, document.id);
      expect(status.body).toMatchObject({ activeExecution: null, lastExecution: { id: execution.id, status: "FAILED", errorCode: "AI_PROVIDER_ERROR" }, lastOutcome: null });
      const serialized = JSON.stringify(status.body);
      for (const hidden of ["fake", "provider error", "UNAVAILABLE", "claude-opus-5"]) expect(serialized, hidden).not.toContain(hidden);
    });
  });

  it("007/US2-4 007/FR-020 o rascunho e as revisões ficam iguais byte a byte depois de cada falha", async () => {
    const confirmed = await fillManually(t, cookie, document.id);
    // A confirmed revision and, on top of it, the teacher's open draft (004 "Nova revisão").
    const draft = await api(t, { cookie }).post(`/api/syllabus-documents/${document.id}/revisions`, { source: "REVISION", basedOnRevisionId: confirmed.id });
    expect(draft.status).toBe(201);
    const before = await syllabusSnapshot(t, document.id);

    for (const step of [fakeError("UNAVAILABLE"), fakeError("RATE_LIMITED"), fakeDelay(CALL_TIMEOUT_MS * 5, fakeOutput(pooOutput()))]) {
      t.provider.script(step);
      expect(["FAILED", "TIMED_OUT"]).toContain((await analyse()).status);
      expect(await syllabusSnapshot(t, document.id)).toEqual(before);
    }
    // A run that reads the document and then fails on the model changes nothing either.
    scriptCurriculumRun(t.provider, document.id, { not: "a valid output" });
    expect((await analyse()).status).toBe("FAILED");
    expect(await syllabusSnapshot(t, document.id)).toEqual(before);
  });

  describe("007/US1-7 007/FR-013 documento sem texto ou ainda não processado", () => {
    it.each([
      ["PNG", "ementa.png"],
      ["JPG", "ementa.jpg"],
    ])("%s processado → DOCUMENT_WITHOUT_TEXT e 409 SYLLABUS_NOT_READY_FOR_AI", async (_label, fixture) => {
      const image = (await seedProcessedDocument(t, teacher.id, fixture)).document;
      expect((await getCurriculumAiStatus(t, cookie, image.id)).body.availability).toBe("DOCUMENT_WITHOUT_TEXT");
      const res = await requestAnalysis(t, cookie, image.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("SYLLABUS_NOT_READY_FOR_AI");
    });

    it("PDF escaneado (processado sem texto) → DOCUMENT_WITHOUT_TEXT e 409", async () => {
      const scanned = await createSyllabusDocument(t, document.subjectId, { fixture: "escaneado.pdf", status: "PROCESSED", extraction: null });
      expect(scanned.extractionResult).toBe("NO_TEXT");
      expect((await getCurriculumAiStatus(t, cookie, scanned.id)).body.availability).toBe("DOCUMENT_WITHOUT_TEXT");
      expect((await requestAnalysis(t, cookie, scanned.id)).body.code).toBe("SYLLABUS_NOT_READY_FOR_AI");
    });

    it.each(["UPLOADED", "PROCESSING", "FAILED"] as const)("documento %s → DOCUMENT_NOT_READY e 409", async (status) => {
      const pending = await createSyllabusDocument(t, document.subjectId, { fixture: "poo.docx", status });
      expect((await getCurriculumAiStatus(t, cookie, pending.id)).body.availability).toBe("DOCUMENT_NOT_READY");
      const res = await requestAnalysis(t, cookie, pending.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("SYLLABUS_NOT_READY_FOR_AI");
      expect(await t.prisma.aiExecution.count()).toBe(0);
    });
  });
});

/**
 * The production definitions without `OPENROUTER_API_KEY` (007/FR-043, 008/FR-003): no provider is registered,
 * so even an enabled agent is MODEL_UNAVAILABLE, and the 004 flow is untouched.
 */
describe("007/US2-1 007/US2-2 sem provedor registrado (produção sem a chave)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it("status MODEL_UNAVAILABLE, pedido 503 e o preenchimento manual funciona", async () => {
    await resetDb(t.prisma);
    await t.get(AiRegistrySync).sync();
    // The admin enabled the agent, but there is no credential for its provider.
    await t.prisma.aiAgent.update({ where: { key: "curriculum-agent" }, data: { status: "ACTIVE" } });
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const cookie = await loginAs(t, teacher);
    const { document } = await seedProcessedDocument(t, teacher.id);

    expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("MODEL_UNAVAILABLE");
    const res = await requestAnalysis(t, cookie, document.id);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("AI_MODEL_UNAVAILABLE");
    expect(await t.prisma.aiExecution.count()).toBe(0);
    await fillManually(t, cookie, document.id);
  });
});
