import { createHash } from "node:crypto";
import { SyllabusDocumentViewSchema } from "@repo/contracts";
import type request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSubject, createUser, loginAs, syllabusFixture, type TestUser } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { registeredRoutes } from "../helpers/routes";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MIB = 1024 * 1024;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Collects a binary response body (supertest only buffers text and JSON by default). */
const binary = (req: request.Test) =>
  req.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => callback(null, Buffer.concat(chunks)));
  });

describe("004/US2 — envio da ementa e original preservado (FR-006 – FR-013)", () => {
  let t: TestApp;
  const logs = new LogCapture();

  beforeAll(async () => {
    t = await createTestApp({ logs });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
  });

  const newTeacher = (name = "Professora Teste") => createUser(t, { roles: ["TEACHER"], name });
  const asUser = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });
  const counts = async () => ({
    files: await t.prisma.storedFile.count(),
    documents: await t.prisma.syllabusDocument.count(),
  });

  async function setup() {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id, { name: "Programação Orientada a Objetos" });
    const client = await asUser(teacher);
    const upload = (bytes: Buffer, filename: string, contentType?: string) =>
      client.upload(`/api/subjects/${subject.id}/syllabus-documents`, { bytes, filename, contentType });
    return { teacher, subject, client, upload };
  }

  it("004/US2-1 PDF válido → 201 UPLOADED versão 1, auditoria sem nome de arquivo e sem chave nem hash na resposta", async () => {
    const { teacher, subject, client, upload } = await setup();
    const res = await upload(syllabusFixture("poo.pdf"), "Ementa POO.pdf", "application/pdf");

    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.document).toMatchObject({
      subjectId: subject.id,
      version: 1,
      originalFilename: "Ementa POO.pdf",
      mediaType: "PDF",
      sizeBytes: syllabusFixture("poo.pdf").length,
      pageCount: 1,
      processingStatus: "UPLOADED",
      failureCategory: null,
      extractionResult: null,
      attempts: 0,
      processedAt: null,
      confirmedRevision: null,
      draftRevisionId: null,
    });
    expect(Object.keys(res.body.document).sort()).toEqual(Object.keys(SyllabusDocumentViewSchema.shape).sort());
    expect(JSON.stringify(res.body)).not.toMatch(/fileId|file_id|sha256/i);

    const [event] = await t.prisma.auditEvent.findMany({ where: { type: "syllabus.uploaded" } });
    expect(event).toMatchObject({
      actorUserId: teacher.id,
      targetType: "SYLLABUS_DOCUMENT",
      targetId: res.body.document.id,
      metadata: { subjectId: subject.id, version: 1, mediaType: "PDF", sizeBytes: res.body.document.sizeBytes },
    });
    expect(JSON.stringify(event!.metadata)).not.toContain("Ementa POO");

    const list = await client.get(`/api/subjects/${subject.id}/syllabus-documents`);
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([res.body.document.id]);
    expect((await client.get(`/api/subjects/${subject.id}`)).body.documentCount).toBe(1);
  });

  it.each([
    ["poo.docx", DOCX_TYPE, "DOCX", null],
    ["ementa.png", "image/png", "PNG", null],
    ["ementa.jpg", "image/jpeg", "JPEG", null],
  ])("004/FR-007 %s é aceito como %s", async (fixture, contentType, mediaType, pageCount) => {
    const { upload } = await setup();
    const res = await upload(syllabusFixture(fixture), fixture, contentType);
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ mediaType, pageCount });
  });

  it("004/US2-2 executável com extensão .pdf, PNG com extensão .docx e Content-Type falso → 400 FILE_TYPE_NOT_ALLOWED, nada gravado", async () => {
    const { upload } = await setup();
    for (const res of [
      await upload(syllabusFixture("executavel.pdf"), "executavel.pdf", "application/pdf"),
      await upload(syllabusFixture("imagem.docx"), "imagem.docx", DOCX_TYPE),
      await upload(syllabusFixture("poo.pdf"), "poo.pdf", "image/png"),
      await upload(syllabusFixture("poo.pdf"), "poo.exe", "application/pdf"),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("FILE_TYPE_NOT_ALLOWED");
    }
    expect(await counts()).toEqual({ files: 0, documents: 0 });
  });

  describe("004/US2-3 004/SC-003 amostras hostis são recusadas sem gravar nada", () => {
    it.each([
      ["corrompido.pdf", "application/pdf", "FILE_UNREADABLE"],
      ["truncado.jpg", "image/jpeg", "FILE_UNREADABLE"],
      ["protegido.pdf", "application/pdf", "FILE_PROTECTED"],
      ["ole.docx", DOCX_TYPE, "FILE_PROTECTED"],
      ["macro.docx", DOCX_TYPE, "FILE_MACROS"],
      ["bomba.docx", DOCX_TYPE, "FILE_TOO_COMPLEX"],
      ["muitas-entradas.docx", DOCX_TYPE, "FILE_TOO_COMPLEX"],
      ["gigante.png", "image/png", "FILE_TOO_COMPLEX"],
      ["executavel.pdf", "application/pdf", "FILE_TYPE_NOT_ALLOWED"],
    ])("%s → 400 %s", async (fixture, contentType, code) => {
      const { upload } = await setup();
      const res = await upload(syllabusFixture(fixture), fixture, contentType);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
      expect(await counts()).toEqual({ files: 0, documents: 0 });

      const rejected = logs.lines().filter((line) => line.msg === "syllabus.upload_rejected");
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ code, declaredType: contentType, sizeBytes: syllabusFixture(fixture).length });
      expect(logs.text()).not.toContain(fixture);
      expect(await t.prisma.auditEvent.count({ where: { type: "syllabus.uploaded" } })).toBe(0);
    });

    it("arquivo de 10 MB + 1 byte → 413 FILE_TOO_LARGE; exatamente 10 MB é aceito", async () => {
      const { upload } = await setup();
      const pdf = syllabusFixture("poo.pdf");
      const tooLarge = Buffer.concat([pdf, Buffer.alloc(10 * MIB + 1 - pdf.length, 0x20)]);
      const res = await upload(tooLarge, "grande.pdf", "application/pdf");
      expect(res.status).toBe(413);
      expect(res.body.code).toBe("FILE_TOO_LARGE");

      // Bytes after IEND are ignored by PNG readers: a valid image of exactly 10 MiB.
      const image = syllabusFixture("ementa.png");
      const atLimit = Buffer.concat([image, Buffer.alloc(10 * MIB - image.length)]);
      expect((await upload(atLimit, "limite.png", "image/png")).status).toBe(201);
      expect(await counts()).toEqual({ files: 1, documents: 1 });
    });
  });

  it("004/US2-4 nome malicioso é gravado saneado; a chave do arquivo é um UUID do servidor", async () => {
    const { upload } = await setup();
    const res = await upload(syllabusFixture("poo.pdf"), "../../etc/‮passwd.pdf", "application/pdf");
    expect(res.status).toBe(201);
    expect(res.body.document.originalFilename).toBe("passwd.pdf");

    const row = await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: res.body.document.id } });
    expect(row.originalFilename).toBe("passwd.pdf");
    expect(row.fileId).toMatch(UUID);
    expect(row.fileId).not.toContain("passwd");
  });

  it("004/US2-5 download devolve o original (SHA-256 igual) com cabeçalhos seguros", async () => {
    const { client, upload } = await setup();
    const bytes = syllabusFixture("poo.pdf");
    const { body } = await upload(bytes, "Ementa – POO (2026).pdf", "application/pdf");

    const res = await binary(client.get(`/api/syllabus-documents/${body.document.id}/file`));
    expect(res.status).toBe(200);
    expect(sha256(res.body as Buffer)).toBe(sha256(bytes));
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="Ementa _ POO (2026).pdf"; filename*=UTF-8''Ementa%20%E2%80%93%20POO%20%282026%29.pdf`,
    );
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");

    const inlinePdf = await client.get(`/api/syllabus-documents/${body.document.id}/file?view=inline`);
    expect(inlinePdf.status).toBe(400);
    expect(inlinePdf.body.code).toBe("VALIDATION_ERROR");
    expect((await client.get(`/api/syllabus-documents/${body.document.id}/file?view=outro`)).status).toBe(400);
  });

  it("004/US2-5 imagem pode ser vista inline (004/FR-020)", async () => {
    const { client, upload } = await setup();
    const bytes = syllabusFixture("ementa.png");
    const { body } = await upload(bytes, "ementa.png", "image/png");
    const res = await binary(client.get(`/api/syllabus-documents/${body.document.id}/file?view=inline`));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["content-disposition"]).toMatch(/^inline; filename="ementa.png"/);
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(sha256(res.body as Buffer)).toBe(sha256(bytes));
  });

  it("004/US2-6 o mesmo arquivo de novo → 200 duplicate: true com a versão existente; outro arquivo vira versão 2", async () => {
    const { subject, client, upload } = await setup();
    const first = await upload(syllabusFixture("poo.pdf"), "poo.pdf", "application/pdf");
    const again = await upload(syllabusFixture("poo.pdf"), "outro-nome.pdf", "application/pdf");
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ document: first.body.document, duplicate: true });
    expect(await counts()).toEqual({ files: 1, documents: 1 });
    expect(await t.prisma.auditEvent.count({ where: { type: "syllabus.uploaded" } })).toBe(1);

    const second = await upload(syllabusFixture("poo.docx"), "poo.docx", DOCX_TYPE);
    expect(second.status).toBe(201);
    expect(second.body.document.version).toBe(2);
    const list = await client.get(`/api/subjects/${subject.id}/syllabus-documents`);
    expect(list.body.items.map((item: { version: number }) => item.version)).toEqual([2, 1]);
  });

  it("o mesmo arquivo em outra disciplina é uma versão nova dela", async () => {
    const { teacher, upload } = await setup();
    const other = await createSubject(t, teacher.id, { name: "Banco de Dados" });
    expect((await upload(syllabusFixture("poo.pdf"), "poo.pdf", "application/pdf")).status).toBe(201);
    const res = await (await asUser(teacher)).upload(`/api/subjects/${other.id}/syllabus-documents`, {
      bytes: syllabusFixture("poo.pdf"),
      filename: "poo.pdf",
      contentType: "application/pdf",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ duplicate: false, document: { subjectId: other.id, version: 1 } });
  });

  it("envios simultâneos numeram as versões sem repetir", async () => {
    const { upload } = await setup();
    const results = await Promise.all([
      upload(syllabusFixture("poo.pdf"), "poo.pdf", "application/pdf"),
      upload(syllabusFixture("poo.docx"), "poo.docx", DOCX_TYPE),
      upload(syllabusFixture("ementa.png"), "ementa.png", "image/png"),
    ]);
    expect(results.map((res) => res.status)).toEqual([201, 201, 201]);
    expect(results.map((res) => res.body.document.version as number).sort()).toEqual([1, 2, 3]);
  });

  it("disciplina desativada → 409 SUBJECT_INACTIVE, nada gravado", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id, { status: "INACTIVE" });
    const res = await (await asUser(teacher)).upload(`/api/subjects/${subject.id}/syllabus-documents`, {
      bytes: syllabusFixture("poo.pdf"),
      filename: "poo.pdf",
      contentType: "application/pdf",
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SUBJECT_INACTIVE");
    expect(await counts()).toEqual({ files: 0, documents: 0 });
  });

  it("disciplina e documento de outro professor → 404 em todas as rotas", async () => {
    const { upload } = await setup();
    const { body } = await upload(syllabusFixture("poo.pdf"), "poo.pdf", "application/pdf");
    const intruder = await asUser(await newTeacher("Outra"));
    const subjectId = body.document.subjectId as string;
    const id = body.document.id as string;

    for (const res of [
      await intruder.get(`/api/subjects/${subjectId}/syllabus-documents`),
      await intruder.upload(`/api/subjects/${subjectId}/syllabus-documents`, {
        bytes: syllabusFixture("poo.docx"),
        filename: "poo.docx",
        contentType: DOCX_TYPE,
      }),
      await intruder.get(`/api/syllabus-documents/${id}`),
      await intruder.get(`/api/syllabus-documents/${id}/file`),
      await intruder.post(`/api/syllabus-documents/${id}/retry`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect(await counts()).toEqual({ files: 1, documents: 1 });
  });

  it("pedido sem arquivo, com campo extra ou em JSON → 400 VALIDATION_ERROR", async () => {
    const { subject, client } = await setup();
    const path = `/api/subjects/${subject.id}/syllabus-documents`;
    expect((await client.post(path, {})).body.code).toBe("VALIDATION_ERROR");
    const withField = await client
      .upload(path, { bytes: syllabusFixture("poo.pdf"), filename: "poo.pdf", contentType: "application/pdf" })
      .field("versao", "3");
    expect(withField.status).toBe(400);
    expect(await counts()).toEqual({ files: 0, documents: 0 });
  });

  it("004/FR-013 não existe rota de exclusão de documento nem de arquivo", async () => {
    const routes = (await registeredRoutes()).map((route) => route.route);
    expect(routes.filter((route) => route.startsWith("DELETE") && /syllabus/.test(route))).toEqual([]);
    const { client, upload } = await setup();
    const { body } = await upload(syllabusFixture("poo.pdf"), "poo.pdf", "application/pdf");
    expect((await client.delete(`/api/syllabus-documents/${body.document.id}`)).status).toBe(404);
    expect(await counts()).toEqual({ files: 1, documents: 1 });
  });

  it("004/US8-5 21º envio na mesma hora → 429 RATE_LIMITED com Retry-After", async () => {
    const { upload } = await setup();
    const bytes = syllabusFixture("poo.pdf");
    for (let index = 0; index < t.config.rateLimit.syllabusUploadsHourly; index++) {
      expect((await upload(bytes, "poo.pdf", "application/pdf")).status).toBeLessThan(300);
    }
    const blocked = await upload(syllabusFixture("poo.docx"), "poo.docx", DOCX_TYPE);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(await counts()).toEqual({ files: 1, documents: 1 });
  });

  it("detalhe traz a extração (nula antes do processamento) e as revisões", async () => {
    const { client, upload } = await setup();
    const { body } = await upload(syllabusFixture("poo.pdf"), "poo.pdf", "application/pdf");
    const res = await client.get(`/api/syllabus-documents/${body.document.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...body.document, extraction: null, revisions: [] });
  });
});
