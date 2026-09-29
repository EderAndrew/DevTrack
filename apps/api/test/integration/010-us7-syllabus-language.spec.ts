import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { languageId } from "../helpers/exercises";
import { createConfirmedRevision, createSubject, createSyllabusDocument, createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** 010/US7: the syllabus (004 revision) declares its programming language, one per syllabus. */

const CONTENT = {
  title: "Programação Orientada a Objetos",
  syllabusText: null,
  competencyText: null,
  groups: [{ title: "Unidade 1", items: [{ text: "Classes e objetos" }] }],
};

describe("010/US7 010/FR-038 010/FR-039 a ementa declara a linguagem", () => {
  let t: TestApp;
  let client: ReturnType<typeof api>;
  let documentId: string;
  let java: string;
  let python: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    const subject = await createSubject(t, teacher.id);
    documentId = (await createSyllabusDocument(t, subject.id, { status: "PROCESSED" })).id;
    [java, python] = await Promise.all([languageId(t, "java"), languageId(t, "python")]);
  });

  const newDraft = async () => {
    const draft = await client.post(`/api/syllabus-documents/${documentId}/revisions`, { source: "MANUAL" });
    expect(draft.status).toBe(201);
    return draft.body.id as string;
  };
  const save = (revisionId: string, languageId: string | null | undefined) =>
    client.put(`/api/syllabus-revisions/${revisionId}`, { ...CONTENT, ...(languageId === undefined ? {} : { languageId }) });

  it("010/US7-1 a linguagem escolhida no rascunho fica na revisão confirmada e na auditoria da confirmação", async () => {
    const revisionId = await newDraft();
    expect((await client.get(`/api/syllabus-revisions/${revisionId}`)).body.language).toBeNull();

    const saved = await save(revisionId, java);
    expect(saved.status).toBe(200);
    expect(saved.body.language).toEqual({ id: java, name: "Java" });
    // "Nenhuma" is a choice too, and a later save can change it again.
    expect((await save(revisionId, null)).body.language).toBeNull();
    expect((await save(revisionId, python)).body.language).toEqual({ id: python, name: "Python" });

    const confirmed = await client.post(`/api/syllabus-revisions/${revisionId}/confirm`, {});
    expect(confirmed.body).toMatchObject({ status: "CONFIRMED", language: { id: python, name: "Python" } });
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "syllabus.revision_confirmed", targetId: revisionId } });
    expect(event.metadata).toMatchObject({ languageId: python });
  });

  it("010/US7-1 um save sem o campo deixa a revisão sem linguagem (o save substitui o rascunho inteiro)", async () => {
    const revisionId = await newDraft();
    await save(revisionId, java);
    expect((await save(revisionId, undefined)).body.language).toBeNull();
  });

  it("010/US7-2 linguagem fora do catálogo ou inativa é recusada com 400 VALIDATION_ERROR, sem mudar o rascunho", async () => {
    const revisionId = await newDraft();
    await save(revisionId, java);
    for (const value of [randomUUID(), "java"]) {
      const res = await save(revisionId, value);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
    }
    const rust = await languageId(t, "rust");
    await t.prisma.programmingLanguage.update({ where: { id: rust }, data: { active: false } });
    try {
      expect((await save(revisionId, rust)).status).toBe(400);
      expect((await client.get(`/api/syllabus-revisions/${revisionId}`)).body.language).toEqual({ id: java, name: "Java" });
    } finally {
      await t.prisma.programmingLanguage.update({ where: { id: rust }, data: { active: true } });
    }
  });

  it("uma linguagem desativada depois de escolhida continua válida no rascunho que já a tem", async () => {
    const revisionId = await newDraft();
    await save(revisionId, java);
    await t.prisma.programmingLanguage.update({ where: { id: java }, data: { active: false } });
    try {
      const res = await save(revisionId, java);
      expect(res.status).toBe(200);
      expect(res.body.language).toEqual({ id: java, name: "Java" });
    } finally {
      await t.prisma.programmingLanguage.update({ where: { id: java }, data: { active: true } });
    }
  });

  it("010/US7-3 revisão confirmada é imutável: a linguagem muda numa nova revisão, que começa com a da anterior", async () => {
    const revisionId = await newDraft();
    await save(revisionId, java);
    await client.post(`/api/syllabus-revisions/${revisionId}/confirm`, {});

    const refused = await save(revisionId, python);
    expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 409, code: "REVISION_CONFIRMED" });
    await expect(
      t.prisma.syllabusRevision.update({ where: { id: revisionId }, data: { languageId: python } }),
    ).rejects.toThrow();

    const next = await client.post(`/api/syllabus-documents/${documentId}/revisions`, { source: "REVISION", basedOnRevisionId: revisionId });
    expect(next.status).toBe(201);
    expect(next.body.language).toEqual({ id: java, name: "Java" });
    expect((await save(next.body.id, python)).body.language).toEqual({ id: python, name: "Python" });
    expect((await client.get(`/api/syllabus-revisions/${revisionId}`)).body.language).toEqual({ id: java, name: "Java" });
  });

  it("010/US7-4 revisões confirmadas antes da 010 não têm linguagem e continuam válidas", async () => {
    const old = await createConfirmedRevision(t, documentId, [{ title: "Unidade", items: ["Tópico antigo"] }]);
    const res = await client.get(`/api/syllabus-revisions/${old.revision.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "CONFIRMED", language: null });
  });

  it("010/US7-5 a lista de linguagens tem as 13 do catálogo, em ordem alfabética", async () => {
    const res = await client.get("/api/programming-languages");
    expect(res.status).toBe(200);
    expect(res.body.map((language: { name: string }) => language.name)).toEqual([
      "Angular",
      "C",
      "C++",
      "Go",
      "HTML & CSS",
      "Java",
      "JavaScript",
      "Nest",
      "Node",
      "PHP",
      "Python",
      "Rust",
      "TypeScript",
    ]);
  });
});
