import { type ExerciseTeacherView, GeneratedExerciseBatchSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EXERCISE_GENERATOR } from "../../src/modules/exercise-ai/definitions/exercise-generator";
import { applyExercises, createClassWithStudents } from "../helpers/activities";
import { createConfirmedTopic, createExercise, createGenerationBatch, languageId } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 019/US2 — the teacher gives a CODE exercise of the bank 0–20 test cases (input, expected output,
 * PUBLIC or PRIVATE), on create, edit and sets; applying the exercise copies them into the activity,
 * and a later edit of the bank never changes it (019/FR-001–FR-003, research B16).
 */

type Visibility = "PUBLIC" | "PRIVATE";
const testCase = (n: number, visibility: Visibility = "PUBLIC") => ({ input: `${n}\n`, expectedOutput: `${n * 2}\n`, visibility });
const cases = (count: number) => Array.from({ length: count }, (_, n) => testCase(n, n % 3 === 2 ? "PRIVATE" : "PUBLIC"));

const common = { explanation: "Dobra o número lido.", difficulty: "BASIC", cognitiveObjective: "APPLY" } as const;
const code = (languageId: string, testCases?: object[]) => ({
  type: "CODE" as const,
  statement: "Leia um inteiro e imprima o dobro.",
  ...common,
  instructions: "Leia da entrada padrão e escreva na saída padrão.",
  expectedSolution: "console.log(Number(require('fs').readFileSync(0, 'utf8')) * 2)",
  languageId,
  ...(testCases ? { testCases } : {}),
});
const multipleChoice = (testCases?: object[]) => ({
  type: "MULTIPLE_CHOICE" as const,
  statement: "Qual operador multiplica?",
  ...common,
  alternatives: [
    { text: "*", isCorrect: true },
    { text: "x", isCorrect: false },
    { text: "^", isCorrect: false },
  ],
  ...(testCases ? { testCases } : {}),
});
const openAnswer = (testCases?: object[]) => ({
  type: "OPEN_ANSWER" as const,
  statement: "O que é a entrada padrão?",
  ...common,
  expectedAnswer: "O fluxo de onde o programa lê.",
  ...(testCases ? { testCases } : {}),
});

/** A `PUT /exercises/:id` body from the teacher view, with `changes` on top. */
const updateBody = (view: ExerciseTeacherView, changes: Record<string, unknown> = {}) => ({
  type: view.type,
  statement: view.statement,
  explanation: view.explanation,
  difficulty: view.difficulty,
  cognitiveObjective: view.cognitiveObjective,
  ...(view.topic ? { syllabusItemId: view.topic.syllabusItemId } : {}),
  ...(view.type === "CODE"
    ? {
        instructions: view.instructions,
        ...(view.starterCode ? { starterCode: view.starterCode } : {}),
        expectedSolution: view.expectedSolution,
        languageId: view.language!.id,
      }
    : {}),
  testCases: view.testCases.map(({ input, expectedOutput, visibility }) => ({ input, expectedOutput, visibility })),
  version: view.version,
  ...changes,
});

describe("019/US2 casos de teste nos exercícios de Código do banco", () => {
  let t: TestApp;
  let teacher: TestUser;
  let client: ReturnType<typeof api>;
  let javascript: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    javascript = await languageId(t, "javascript");
  });

  const create = (body: object, status = "DRAFT") => client.post("/api/exercises", { ...body, status });
  const audit = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const rulesError = (violations: object[]) => ({ statusCode: 422, code: "EXERCISE_RULES", details: { violations } });

  describe("cadastro", () => {
    it("019/US2-1 019/FR-001 cada caso tem entrada (pode ser vazia), saída esperada e visibilidade, na ordem enviada", async () => {
      const res = await create(code(javascript, [testCase(1), { input: "", expectedOutput: "0\n", visibility: "PRIVATE" }, testCase(3)]));
      expect(res.status).toBe(201);
      expect((res.body as ExerciseTeacherView).testCases).toEqual([
        { position: 0, input: "1\n", expectedOutput: "2\n", visibility: "PUBLIC" },
        { position: 1, input: "", expectedOutput: "0\n", visibility: "PRIVATE" },
        { position: 2, input: "3\n", expectedOutput: "6\n", visibility: "PUBLIC" },
      ]);
      expect((await client.get(`/api/exercises/${res.body.id}`)).body.testCases).toEqual(res.body.testCases);
    });

    it("019/FR-001 0, 1 e 20 casos são aceitos; 21 é um corpo inválido (400)", async () => {
      for (const count of [0, 1, 20]) {
        const res = await create(code(javascript, cases(count)));
        expect(res.status, String(count)).toBe(201);
        expect(res.body.testCases, String(count)).toHaveLength(count);
      }
      expect((await create(code(javascript))).body.testCases).toEqual([]);
      const before = await t.prisma.exercise.count();
      expect((await create(code(javascript, cases(21)))).status).toBe(400);
      expect(await t.prisma.exercise.count()).toBe(before);
    });

    it("019/FR-001 saída esperada vazia → 422 EXERCISE_RULES apontando o caso; nada é gravado", async () => {
      const res = await create(code(javascript, [testCase(1), testCase(2), { input: "3", expectedOutput: "", visibility: "PUBLIC" }]));
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject(rulesError([{ position: 0, field: "testCases.2.expectedOutput", reason: "TEST_CASE_EXPECTED_OUTPUT" }]));
      expect(await t.prisma.exercise.count()).toBe(0);
    });

    it("019/US2-2 casos em Múltipla escolha ou Pergunta e resposta → 422 TEST_CASES_NOT_ALLOWED; lista vazia é aceita", async () => {
      for (const body of [multipleChoice([testCase(1)]), openAnswer([testCase(1)])]) {
        const res = await create(body);
        expect(res.status, body.type).toBe(422);
        expect(res.body, body.type).toMatchObject(rulesError([{ position: 0, field: "testCases", reason: "TEST_CASES_NOT_ALLOWED" }]));
      }
      expect(await t.prisma.exercise.count()).toBe(0);
      expect((await create(multipleChoice([]))).status).toBe(201);
      expect((await create(openAnswer([]))).status).toBe(201);
    });

    it("019/FR-001 sets: casos em cada exercício; uma violação recusa o conjunto inteiro e aponta a posição", async () => {
      const ok = await client.post("/api/exercises/sets", {
        exercises: [openAnswer(), code(javascript, cases(3)), code(javascript)],
        status: "APPROVED",
      });
      expect(ok.status).toBe(201);
      expect(ok.body.items.map((item: ExerciseTeacherView) => item.testCases.length)).toEqual([0, 3, 0]);

      const before = await t.prisma.exercise.count();
      const bad = await client.post("/api/exercises/sets", {
        exercises: [code(javascript, cases(2)), multipleChoice([testCase(1)]), code(javascript, [{ input: "", expectedOutput: "", visibility: "PUBLIC" }])],
        status: "DRAFT",
      });
      expect(bad.status).toBe(422);
      expect(bad.body).toMatchObject(
        rulesError([
          { position: 1, field: "testCases", reason: "TEST_CASES_NOT_ALLOWED" },
          { position: 2, field: "testCases.0.expectedOutput", reason: "TEST_CASE_EXPECTED_OUTPUT" },
        ]),
      );
      expect(await t.prisma.exercise.count()).toBe(before);
    });

    it("019/FR-001 a auditoria conta os casos e os públicos, sem nenhum texto de caso", async () => {
      await create(code(javascript, [testCase(41), testCase(42, "PRIVATE"), testCase(43)]));
      await create(openAnswer());
      const created = (await audit("exercise.created")).map((event) => event.metadata as Record<string, unknown>);
      expect(created.map((metadata) => [metadata.testCaseCount, metadata.publicTestCaseCount])).toEqual([
        [3, 2],
        [0, 0],
      ]);
      const serialized = JSON.stringify((await t.prisma.auditEvent.findMany()).map((event) => event.metadata));
      for (const text of ["41\\n", "82\\n", "84\\n"]) expect(serialized).not.toContain(text);
    });
  });

  describe("edição", () => {
    it("019/FR-001 019/FR-003 editar troca a lista inteira, com a versão otimista; APPROVED continua APPROVED", async () => {
      const created = (await create(code(javascript, cases(3)), "APPROVED")).body as ExerciseTeacherView;
      const replaced = [testCase(7, "PRIVATE"), testCase(8)];
      const res = await client.put(`/api/exercises/${created.id}`, updateBody(created, { testCases: replaced }));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "APPROVED", version: created.version + 1 });
      expect((res.body as ExerciseTeacherView).testCases.map(({ input, visibility, position }) => [position, input, visibility])).toEqual([
        [0, "7\n", "PRIVATE"],
        [1, "8\n", "PUBLIC"],
      ]);
      expect(await t.prisma.exerciseTestCase.count({ where: { exerciseId: created.id } })).toBe(2);

      const edited = (await audit("exercise.edited")).at(-1)!.metadata as Record<string, unknown>;
      expect(edited).toMatchObject({ fields: ["testCases"], testCaseCount: 2, publicTestCaseCount: 1, status: "APPROVED" });

      // The version read before the edit is stale now.
      expect((await client.put(`/api/exercises/${created.id}`, updateBody(created, { testCases: [] }))).status).toBe(409);
    });

    it("019/FR-001 reordenar ou mudar a visibilidade é uma edição; salvar igual não grava nada", async () => {
      const created = (await create(code(javascript, [testCase(1), testCase(2)]))).body as ExerciseTeacherView;
      const same = await client.put(`/api/exercises/${created.id}`, updateBody(created));
      expect(same.body.version).toBe(created.version);
      expect(await audit("exercise.edited")).toHaveLength(0);

      const reordered = await client.put(`/api/exercises/${created.id}`, updateBody(created, { testCases: [testCase(2), testCase(1)] }));
      expect(reordered.body.testCases.map((item: { input: string }) => item.input)).toEqual(["2\n", "1\n"]);
      const hidden = await client.put(`/api/exercises/${created.id}`, updateBody(reordered.body, { testCases: [testCase(2, "PRIVATE"), testCase(1)] }));
      expect(hidden.body.testCases.map((item: { visibility: string }) => item.visibility)).toEqual(["PRIVATE", "PUBLIC"]);
      expect(await audit("exercise.edited")).toHaveLength(2);

      const cleared = await client.put(`/api/exercises/${created.id}`, updateBody(hidden.body, { testCases: [] }));
      expect(cleared.body.testCases).toEqual([]);
    });

    it("019/FR-001 na edição as mesmas regras: 422 apontando o campo, e o exercício não muda", async () => {
      const created = (await create(code(javascript, [testCase(1)]))).body as ExerciseTeacherView;
      const res = await client.put(
        `/api/exercises/${created.id}`,
        updateBody(created, { testCases: [testCase(1), { input: "x", expectedOutput: "", visibility: "PRIVATE" }] }),
      );
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject(rulesError([{ position: 0, field: "testCases.1.expectedOutput", reason: "TEST_CASE_EXPECTED_OUTPUT" }]));
      expect((await client.get(`/api/exercises/${created.id}`)).body).toMatchObject({ version: created.version, testCases: created.testCases });

      const choice = (await create(multipleChoice())).body as ExerciseTeacherView;
      const withCases = await client.put(`/api/exercises/${choice.id}`, {
        ...multipleChoice([testCase(1)]),
        version: choice.version,
      });
      expect(withCases.status).toBe(422);
      expect(withCases.body).toMatchObject(rulesError([{ position: 0, field: "testCases", reason: "TEST_CASES_NOT_ALLOWED" }]));
    });

    it("019/FR-001 exercício arquivado não é editado (010): os casos ficam como estavam", async () => {
      const created = (await create(code(javascript, [testCase(1)]), "APPROVED")).body as ExerciseTeacherView;
      const archived = (await client.post(`/api/exercises/${created.id}/archive`, { version: created.version })).body as ExerciseTeacherView;
      expect(archived.testCases).toHaveLength(1);
      expect((await client.put(`/api/exercises/${created.id}`, updateBody(archived, { testCases: [] }))).status).toBe(409);
      const restored = (await client.post(`/api/exercises/${created.id}/restore`, { version: archived.version })).body as ExerciseTeacherView;
      expect(restored.testCases).toEqual(created.testCases);
    });
  });

  describe("aplicação (snapshot da 012)", () => {
    let classId: string;

    beforeEach(async () => {
      const syllabus = await createConfirmedSyllabus(t, teacher.id);
      classId = (await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 1 })).schoolClass.id;
    });

    const snapshotCases = async (activityId: string) =>
      t.prisma.classActivityTestCase.findMany({
        where: { question: { activityId } },
        orderBy: { position: "asc" },
        select: { position: true, input: true, expectedOutput: true, visibility: true },
      });

    it("019/US2-3 019/FR-002 os casos são copiados na ordem; editar ou arquivar o exercício depois não muda a atividade", async () => {
      const created = (await create(code(javascript, [testCase(1), testCase(2, "PRIVATE"), testCase(3)]), "APPROVED")).body as ExerciseTeacherView;
      const applied = await applyExercises(client, classId, [created.id], { acknowledgeOutOfScope: true });
      expect(applied.status).toBe(201);
      const copied = await snapshotCases(applied.body.id);
      expect(copied).toEqual([
        { position: 0, input: "1\n", expectedOutput: "2\n", visibility: "PUBLIC" },
        { position: 1, input: "2\n", expectedOutput: "4\n", visibility: "PRIVATE" },
        { position: 2, input: "3\n", expectedOutput: "6\n", visibility: "PUBLIC" },
      ]);

      const edited = (await client.put(`/api/exercises/${created.id}`, updateBody(created, { testCases: [testCase(9)] }))).body as ExerciseTeacherView;
      await client.post(`/api/exercises/${created.id}/archive`, { version: edited.version });
      expect(await snapshotCases(applied.body.id)).toEqual(copied);
    });

    it("019/US2-4 sem caso público ou numa linguagem sem execução: aplicado normalmente, com os casos que tiver", async () => {
      const onlyPrivate = (await create(code(javascript, [testCase(1, "PRIVATE")]), "APPROVED")).body as ExerciseTeacherView;
      const withoutExecution = (await create(code(await languageId(t, "c"), [testCase(1)]), "APPROVED")).body as ExerciseTeacherView;
      const withoutCases = (await create(code(javascript), "APPROVED")).body as ExerciseTeacherView;
      const applied = await applyExercises(client, classId, [onlyPrivate.id, withoutExecution.id, withoutCases.id], { acknowledgeOutOfScope: true });
      expect(applied.status).toBe(201);
      const questions = await t.prisma.classActivityQuestion.findMany({
        where: { activityId: applied.body.id },
        orderBy: { position: "asc" },
        select: { testCases: { select: { visibility: true } } },
      });
      expect(questions.map((question) => question.testCases.map((testCase) => testCase.visibility))).toEqual([["PRIVATE"], ["PUBLIC"], []]);
    });
  });

  describe("Criar com IA (010) não muda", () => {
    it("019/US2-5 019/FR-003 o agente não propõe casos: o esquema de saída não tem o campo, e o rascunho chega sem casos", () => {
      const generated = {
        type: "CODE",
        statement: "Some dois números.",
        explanation: "Soma.",
        difficulty: "BASIC",
        cognitiveObjective: "APPLY",
        instructions: "Leia dois inteiros.",
        starterCode: null,
        expectedSolution: "print(sum(map(int, input().split())))",
        language: "Python",
      };
      expect(GeneratedExerciseBatchSchema.safeParse({ exercises: [generated] }).success).toBe(true);
      expect(GeneratedExerciseBatchSchema.safeParse({ exercises: [{ ...generated, testCases: [testCase(1)] }] }).success).toBe(false);
      expect(EXERCISE_GENERATOR.output!.schema).toBe(GeneratedExerciseBatchSchema);
      expect(EXERCISE_GENERATOR.output!.version).toBe(1);
    });

    it("019/US2-5 o professor adiciona casos ao rascunho gerado na revisão, antes ou depois de aprovar", async () => {
      const topic = await createConfirmedTopic(t, teacher.id, { languageKey: "python" });
      const batch = await createGenerationBatch(t, teacher.id, topic);
      const draft = await createExercise(t, teacher.id, {
        type: "CODE",
        origin: "AI_GENERATED",
        status: "DRAFT",
        generationBatchId: batch.id,
        syllabusItemId: topic.itemId,
        languageId: topic.languageId!,
      });
      const before = (await client.get(`/api/exercises/${draft.id}`)).body as ExerciseTeacherView;
      expect(before.testCases).toEqual([]);

      const edited = await client.put(`/api/exercises/${draft.id}`, updateBody(before, { testCases: [testCase(1)] }));
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ status: "DRAFT", origin: "AI_GENERATED", humanEdited: true });
      const approved = (await client.post(`/api/exercises/${draft.id}/approve`, { version: edited.body.version })).body as ExerciseTeacherView;
      const after = await client.put(`/api/exercises/${draft.id}`, updateBody(approved, { testCases: [testCase(1), testCase(2, "PRIVATE")] }));
      expect(after.status).toBe(200);
      expect(after.body).toMatchObject({ status: "APPROVED" });
      expect(after.body.testCases).toHaveLength(2);
    });
  });

  it("019/FR-003 só o dono vê e edita os casos: outro professor recebe 404", async () => {
    const created = (await create(code(javascript, [testCase(1, "PRIVATE")]))).body as ExerciseTeacherView;
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherClient = api(t, { cookie: await loginAs(t, other) });
    expect((await otherClient.get(`/api/exercises/${created.id}`)).status).toBe(404);
    expect((await otherClient.put(`/api/exercises/${created.id}`, updateBody(created, { testCases: [] }))).status).toBe(404);
    expect(await t.prisma.exerciseTestCase.count({ where: { exerciseId: created.id } })).toBe(1);
  });
});
