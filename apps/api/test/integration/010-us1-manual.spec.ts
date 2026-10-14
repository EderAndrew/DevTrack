import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createConfirmedTopic, languageId } from "../helpers/exercises";
import { createSubject, createSyllabusDocument, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 010/US1 — the teacher creates exercises by hand: sets of 3–10, all or nothing, with the same
 * structural rules as every other path, and no AI involved (010/FR-016, 010/SC-001).
 */

const common = { explanation: "Porque a subclasse herda o comportamento.", difficulty: "BASIC", cognitiveObjective: "UNDERSTAND" } as const;

const openAnswer = (statement = "O que é herança?") => ({
  type: "OPEN_ANSWER" as const,
  statement,
  ...common,
  expectedAnswer: "Reuso de comportamento de uma superclasse.",
});

const multipleChoice = (alternatives = [
  { text: "extends", isCorrect: true },
  { text: "implements", isCorrect: false },
  { text: "inherits", isCorrect: false },
]) => ({
  type: "MULTIPLE_CHOICE" as const,
  statement: "Qual palavra-chave declara herança em Java?",
  ...common,
  alternatives,
});

const code = (languageId: string | undefined) => ({
  type: "CODE" as const,
  statement: "Implemente a classe Cachorro.",
  ...common,
  instructions: "Cachorro deve estender Animal e sobrescrever falar().",
  starterCode: "class Cachorro {}",
  expectedSolution: "class Cachorro extends Animal { String falar() { return \"au\"; } }",
  languageId,
});

describe("010/US1 criar exercícios manualmente", () => {
  let t: TestApp;
  let teacher: TestUser;
  let client: ReturnType<typeof api>;
  let java: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    java = await languageId(t, "java");
  });

  const exerciseCount = () => t.prisma.exercise.count();
  const created = () => t.prisma.auditEvent.findMany({ where: { type: "exercise.created" }, orderBy: { id: "asc" } });
  const set = (exercises: object[], status = "APPROVED") => client.post("/api/exercises/sets", { exercises, status });

  it("010/US1-1 010/SC-001 um conjunto com um exercício de cada tipo entra no banco com origem MANUAL e auditado", async () => {
    const res = await set([openAnswer(), multipleChoice(), code(java)]);

    expect(res.status).toBe(201);
    expect(res.body.items.map((item: { type: string }) => item.type)).toEqual(["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"]);
    for (const item of res.body.items) {
      expect(item).toMatchObject({ origin: "MANUAL", status: "APPROVED", version: 1, humanReviewed: false, batchId: null, topic: null });
    }
    expect(res.body.items[1].alternatives.map((a: { text: string; isCorrect: boolean; position: number }) => [a.position, a.text, a.isCorrect])).toEqual([
      [0, "extends", true],
      [1, "implements", false],
      [2, "inherits", false],
    ]);
    expect(res.body.items[1].isTrickQuestion).toBe(false);
    expect(res.body.items[2]).toMatchObject({ language: { id: java, name: "Java" }, starterCode: "class Cachorro {}" });

    const rows = await t.prisma.exercise.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toMatchObject({ teacherId: teacher.id, origin: "MANUAL", generationBatchId: null });
    expect(rows.find((row) => row.type === "OPEN_ANSWER")?.statementSearchKey).toBe("o que e heranca?");

    const events = await created();
    expect(events).toHaveLength(3);
    for (const [index, event] of events.entries()) {
      expect(event).toMatchObject({ actorType: "USER", actorUserId: teacher.id, targetType: "EXERCISE", targetId: res.body.items[index].id });
      expect(event.requestId).not.toBeNull();
      expect(event.metadata).toEqual({ type: res.body.items[index].type, difficulty: "BASIC", status: "APPROVED", setSize: 3, syllabusItemId: null, testCaseCount: 0, publicTestCaseCount: 0 });
    }
    // The audit never carries the content (contracts/audit-events.md).
    expect(JSON.stringify(events.map((event) => event.metadata))).not.toContain("herança");
  });

  it("010/US1-1 010/FR-011 o professor escolhe salvar como rascunho", async () => {
    const res = await set([openAnswer("Um"), openAnswer("Dois"), openAnswer("Três")], "DRAFT");
    expect(res.status).toBe(201);
    expect(res.body.items.map((item: { status: string }) => item.status)).toEqual(["DRAFT", "DRAFT", "DRAFT"]);
  });

  it.each([
    ["ARCHIVED"],
    [undefined],
  ])("010/FR-011 um conjunto não nasce %s", async (status) => {
    const res = await client.post("/api/exercises/sets", { exercises: [openAnswer(), openAnswer(), openAnswer()], status });
    expect(res.status).toBe(400);
    expect(await exerciseCount()).toBe(0);
  });

  it.each([
    [2, 400],
    [3, 201],
    [10, 201],
    [11, 400],
  ])("010/US1-2 010/FR-016 um conjunto de %i exercícios → %i", async (size, status) => {
    const res = await set(Array.from({ length: size }, (_, i) => openAnswer(`Pergunta ${i + 1}`)));
    expect(res.status).toBe(status);
    expect(await exerciseCount()).toBe(status === 201 ? size : 0);
    expect(await created()).toHaveLength(status === 201 ? size : 0);
  });

  const alternatives = (count: number, correct: number) =>
    Array.from({ length: count }, (_, i) => ({ text: `Alternativa ${i + 1}`, isCorrect: i < correct }));

  it.each([
    ["2 alternativas", alternatives(2, 1), 400],
    ["3 alternativas", alternatives(3, 1), 201],
    ["5 alternativas", alternatives(5, 1), 201],
    ["6 alternativas", alternatives(6, 1), 400],
    ["nenhuma correta", alternatives(4, 0), 400],
    ["duas corretas", alternatives(4, 2), 400],
    ["texto repetido (sem acento e maiúsculas)", [{ text: "Herança", isCorrect: true }, { text: "heranca", isCorrect: false }, { text: "Outra", isCorrect: false }], 400],
  ])("010/US1-3 010/FR-004 múltipla escolha com %s no meio do conjunto → %i, tudo ou nada", async (_, list, status) => {
    const res = await set([openAnswer(), multipleChoice(list), code(java)]);
    expect(res.status).toBe(status);
    if (status === 400) expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await exerciseCount()).toBe(status === 201 ? 3 : 0);
    expect(await t.prisma.exerciseAlternative.count()).toBe(status === 201 ? list.length : 0);
  });

  it("010/US1-3 010/FR-004 a pegadinha é marcável na criação manual", async () => {
    const res = await set([{ ...multipleChoice(), isTrickQuestion: true }, openAnswer(), openAnswer("Outra")]);
    expect(res.status).toBe(201);
    expect(res.body.items[0].isTrickQuestion).toBe(true);
  });

  it("010/US1-4 010/FR-005 código sem linguagem ou fora do catálogo é recusado", async () => {
    expect((await set([code(undefined), openAnswer(), openAnswer("Outra")])).status).toBe(400);
    const unknown = await set([code(randomUUID()), openAnswer(), openAnswer("Outra")]);
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("VALIDATION_ERROR");
    expect(await exerciseCount()).toBe(0);
  });

  it("010/US1-4 010/FR-005 uma linguagem inativa do catálogo é recusada", async () => {
    const rust = await languageId(t, "rust");
    // The catalog survives resetDb: restore the entry whatever happens.
    await t.prisma.programmingLanguage.update({ where: { id: rust }, data: { active: false } });
    try {
      const res = await set([code(rust), openAnswer(), openAnswer("Outra")]);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(await exerciseCount()).toBe(0);
    } finally {
      await t.prisma.programmingLanguage.update({ where: { id: rust }, data: { active: true } });
    }
  });

  it("010/US1-4 010/FR-040 um exercício de código ligado a um tópico pode usar outra linguagem que a da ementa", async () => {
    const topic = await createConfirmedTopic(t, teacher.id, { languageKey: "java" });
    const python = await languageId(t, "python");
    const res = await set([{ ...code(python), syllabusItemId: topic.itemId }, openAnswer(), openAnswer("Outra")]);
    expect(res.status).toBe(201);
    expect(res.body.items[0].language).toEqual({ id: python, name: "Python", highlight: "python" });
  });

  describe("010/US1-5 tópico da ementa", () => {
    it("um tópico de uma ementa confirmada do professor liga o exercício e aparece na visão", async () => {
      const topic = await createConfirmedTopic(t, teacher.id);
      const res = await set([{ ...openAnswer(), syllabusItemId: topic.itemId }, openAnswer("Dois"), openAnswer("Três")]);
      expect(res.status).toBe(201);
      expect(res.body.items[0].topic).toEqual({
        syllabusItemId: topic.itemId,
        itemText: "Herança e polimorfismo",
        subjectId: topic.subject.id,
        subjectName: topic.subject.name,
        syllabusRevisionId: topic.revision.id,
      });
      expect(res.body.items[1].topic).toBeNull();
      expect((await created())[0]!.metadata).toMatchObject({ syllabusItemId: topic.itemId });
    });

    it("um tópico de outro professor, ou inexistente, é 404 sem gravar nada", async () => {
      const other = await createUser(t, { roles: ["TEACHER"] });
      const foreign = await createConfirmedTopic(t, other.id);
      for (const syllabusItemId of [foreign.itemId, randomUUID()]) {
        const res = await set([{ ...openAnswer(), syllabusItemId }, openAnswer("Dois"), openAnswer("Três")]);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: "NOT_FOUND" });
      }
      expect(await exerciseCount()).toBe(0);
    });

    it("um tópico de uma revisão em rascunho do professor é 422 REVISION_NOT_CONFIRMED", async () => {
      const subject = await createSubject(t, teacher.id);
      const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
      const revision = await t.prisma.syllabusRevision.create({ data: { documentId: document.id, number: 1, status: "DRAFT", source: "MANUAL" } });
      const group = await t.prisma.syllabusGroup.create({ data: { revisionId: revision.id, position: 1 } });
      const item = await t.prisma.syllabusItem.create({ data: { revisionId: revision.id, groupId: group.id, position: 1, text: "Rascunho" } });

      const res = await set([{ ...openAnswer(), syllabusItemId: item.id }, openAnswer("Dois"), openAnswer("Três")]);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 422, code: "REVISION_NOT_CONFIRMED" });
      expect(await exerciseCount()).toBe(0);
    });
  });

  describe("010/US5-6 exercício avulso", () => {
    it("entra com origem MANUAL, as mesmas regras e sem o mínimo de 3", async () => {
      const res = await client.post("/api/exercises", { ...code(java), status: "DRAFT" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type: "CODE", origin: "MANUAL", status: "DRAFT", language: { id: java, name: "Java" } });

      const [event] = await created();
      expect(event!.metadata).toEqual({ type: "CODE", difficulty: "BASIC", status: "DRAFT", setSize: 1, syllabusItemId: null, testCaseCount: 0, publicTestCaseCount: 0 });

      const got = await client.get(`/api/exercises/${res.body.id}`);
      expect(got.status).toBe(200);
      expect(got.body).toEqual(res.body);
    });

    it("as regras de estrutura valem também para o avulso", async () => {
      const res = await client.post("/api/exercises", { ...multipleChoice(alternatives(2, 1)), status: "APPROVED" });
      expect(res.status).toBe(400);
      expect(await exerciseCount()).toBe(0);
    });
  });

  it.each([
    ["teacherId", { teacherId: randomUUID() }],
    ["origin", { origin: "AI_GENERATED" }],
    ["humanReviewed", { humanReviewed: true }],
    ["model", { model: "qualquer" }],
  ])("campos controlados pelo servidor são recusados: %s → 400", async (_, extra) => {
    const res = await client.post("/api/exercises", { ...openAnswer(), status: "APPROVED", ...extra });
    expect(res.status).toBe(400);
    expect(await exerciseCount()).toBe(0);
  });

  it("GET /exercises/:id de outro professor é 404", async () => {
    const res = await client.post("/api/exercises", { ...openAnswer(), status: "APPROVED" });
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherClient = api(t, { cookie: await loginAs(t, other) });
    expect((await otherClient.get(`/api/exercises/${res.body.id}`)).status).toBe(404);
    expect((await otherClient.get(`/api/exercises/${randomUUID()}`)).status).toBe(404);
  });

  it("GET /programming-languages lista as 13 linguagens ativas em ordem de nome", async () => {
    const res = await client.get("/api/programming-languages");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(13);
    const names = res.body.map((language: { name: string }) => language.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b, "pt-BR")));
    // 019: `execution` is the Code Runner profile of the catalog (research B5); Angular, the first by name, has none.
    expect(res.body[0]).toEqual({ id: expect.any(String), key: expect.any(String), name: expect.any(String), highlight: expect.any(String), execution: null });
  });

  it("010/US1-6 010/SC-001 nenhuma execução nem custo de IA depois de toda a criação manual", async () => {
    const topic = await createConfirmedTopic(t, teacher.id);
    expect((await set([{ ...openAnswer(), syllabusItemId: topic.itemId }, multipleChoice(), code(java)])).status).toBe(201);
    expect((await client.post("/api/exercises", { ...openAnswer("Avulso"), status: "DRAFT" })).status).toBe(201);
    expect((await set([openAnswer()])).status).toBe(400);

    expect(await exerciseCount()).toBe(4);
    expect(await t.prisma.aiExecution.count()).toBe(0);
    expect(await t.prisma.aiModelCall.count()).toBe(0);
    expect(await t.prisma.exerciseGenerationBatch.count()).toBe(0);
  });
});
