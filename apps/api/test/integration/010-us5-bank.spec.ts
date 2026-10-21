import type { ExercisePage, ExerciseTeacherView } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type ConfirmedTopic, createConfirmedTopic, createExercise, createGenerationBatch, languageId } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 010/US5 — the teacher queries and maintains the bank: combinable filters, a search that ignores
 * case and accents, keyset pages of at most 50 (archived only when filtered), editing an APPROVED
 * exercise, archiving and restoring; another teacher's exercise is 404 on every route.
 */
describe("010/US5 consultar e manter o banco", () => {
  let t: TestApp;
  let teacher: TestUser;
  let other: TestUser;
  let cookie: string;
  let poo: ConfirmedTopic;
  let py: ConfirmedTopic;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    other = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    poo = await createConfirmedTopic(t, teacher.id, { languageKey: "java" });
    py = await createConfirmedTopic(t, teacher.id, { languageKey: "python", items: ["Filas", "Pilhas"] });
  });

  const client = () => api(t, { cookie });
  const list = async (query: Record<string, string | number> = {}): Promise<ExercisePage> => {
    const res = await client().get(`/api/exercises?${new URLSearchParams(Object.entries(query).map(([k, v]): [string, string] => [k, String(v)]))}`);
    expect(res.status).toBe(200);
    return res.body as ExercisePage;
  };
  const statements = (page: ExercisePage) => page.items.map((item) => item.statement).sort();
  const view = async (id: string): Promise<ExerciseTeacherView> => (await client().get(`/api/exercises/${id}`)).body as ExerciseTeacherView;
  const audits = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  /** A bank of 7 exercises of the teacher over two subjects, plus one of another teacher. */
  async function seedBank() {
    const python = await languageId(t, "python");
    const batch = await createGenerationBatch(t, teacher.id, poo, { generatedAt: new Date() });
    const rows = {
      heranca: await createExercise(t, teacher.id, { statement: "Explique a Herança em Java", syllabusItemId: poo.itemId, difficulty: "BASIC", cognitiveObjective: "UNDERSTAND" }),
      semAcento: await createExercise(t, teacher.id, {
        type: "OPEN_ANSWER",
        status: "DRAFT",
        statement: "O que é heranca múltipla?",
        syllabusItemId: poo.itemIds[1],
        difficulty: "INTERMEDIATE",
        cognitiveObjective: "ANALYZE",
      }),
      fila: await createExercise(t, teacher.id, {
        type: "CODE",
        statement: "Implemente uma fila",
        syllabusItemId: py.itemId,
        languageId: python,
        difficulty: "ADVANCED",
        cognitiveObjective: "CREATE",
      }),
      pilha: await createExercise(t, teacher.id, { type: "CODE", statement: "Implemente uma pilha em Java", difficulty: "ADVANCED", cognitiveObjective: "APPLY" }),
      gerado: await createExercise(t, teacher.id, {
        type: "OPEN_ANSWER",
        origin: "AI_GENERATED",
        status: "DRAFT",
        statement: "Herança versus composição",
        syllabusItemId: poo.itemId,
        generationBatchId: batch.id,
      }),
      avulso: await createExercise(t, teacher.id, { statement: "Pergunta sem tópico", cognitiveObjective: "RECOGNIZE" }),
      arquivado: await createExercise(t, teacher.id, { status: "ARCHIVED", statement: "Herança arquivada", syllabusItemId: poo.itemId }),
    };
    await createExercise(t, other.id, { statement: "Herança do professor B" });
    return { ...rows, batch };
  }

  it("010/US5-1 filtra por cada campo e pela combinação; só os exercícios do professor; arquivados só quando filtrados", async () => {
    await seedBank();
    const java = await languageId(t, "java");

    expect(statements(await list())).toEqual(
      ["Explique a Herança em Java", "Herança versus composição", "Implemente uma fila", "Implemente uma pilha em Java", "O que é heranca múltipla?", "Pergunta sem tópico"].sort(),
    );
    expect(statements(await list({ subjectId: poo.subject.id }))).toEqual(["Explique a Herança em Java", "Herança versus composição", "O que é heranca múltipla?"].sort());
    expect(statements(await list({ syllabusRevisionId: py.revision.id }))).toEqual(["Implemente uma fila"]);
    expect(statements(await list({ syllabusItemId: poo.itemId }))).toEqual(["Explique a Herança em Java", "Herança versus composição"].sort());
    expect(statements(await list({ difficulty: "ADVANCED" }))).toEqual(["Implemente uma fila", "Implemente uma pilha em Java"]);
    expect(statements(await list({ cognitiveObjective: "RECOGNIZE" }))).toEqual(["Pergunta sem tópico"]);
    expect(statements(await list({ type: "OPEN_ANSWER" }))).toEqual(["Herança versus composição", "O que é heranca múltipla?"]);
    expect(statements(await list({ origin: "AI_GENERATED" }))).toEqual(["Herança versus composição"]);
    expect(statements(await list({ status: "DRAFT" }))).toEqual(["Herança versus composição", "O que é heranca múltipla?"]);
    expect(statements(await list({ status: "ARCHIVED" }))).toEqual(["Herança arquivada"]);
    expect(statements(await list({ languageId: java }))).toEqual(["Implemente uma pilha em Java"]);
    // Every filter at once must hold together.
    expect(statements(await list({ subjectId: poo.subject.id, type: "OPEN_ANSWER", status: "DRAFT", origin: "MANUAL", query: "heranca" }))).toEqual([
      "O que é heranca múltipla?",
    ]);
    expect(statements(await list({ subjectId: poo.subject.id, difficulty: "ADVANCED" }))).toEqual([]);
    // Another teacher's subject is just an empty result.
    const foreign = await createConfirmedTopic(t, other.id);
    expect((await list({ subjectId: foreign.subject.id })).items).toEqual([]);
  });

  it("010/US5-2 a busca ignora maiúsculas e acentos e trata % e _ como texto", async () => {
    await seedBank();
    const expected = ["Explique a Herança em Java", "Herança versus composição", "O que é heranca múltipla?"].sort();
    expect(statements(await list({ query: "herança" }))).toEqual(expected);
    expect(statements(await list({ query: "HERANCA" }))).toEqual(expected);
    expect(statements(await list({ query: "  Herança  " }))).toEqual(expected);
    expect(statements(await list({ query: "herança", status: "ARCHIVED" }))).toEqual(["Herança arquivada"]);
    expect((await list({ query: "%" })).items).toEqual([]);
    expect((await list({ query: "_" })).items).toEqual([]);
    const tooLong = await client().get(`/api/exercises?query=${"a".repeat(201)}`);
    expect(tooLong.status).toBe(400);
  });

  it("010/US5-1 pagina por cursor sem repetir nem pular, mais recentes primeiro; página ≤ 50", async () => {
    const same = new Date("2026-09-01T12:00:00.000Z");
    const created: string[] = [];
    // Five share the same instant (the id breaks the tie), two are older.
    for (let i = 0; i < 5; i += 1) created.push((await createExercise(t, teacher.id, { statement: `Mesmo instante ${i}`, updatedAt: same })).id);
    created.push((await createExercise(t, teacher.id, { statement: "Antigo 1", updatedAt: new Date("2026-08-01T12:00:00.000Z") })).id);
    created.push((await createExercise(t, teacher.id, { statement: "Antigo 2", updatedAt: new Date("2026-07-01T12:00:00.000Z") })).id);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: ExercisePage = await list({ pageSize: 3, ...(cursor ? { cursor } : {}) });
      expect(page.items.length).toBeLessThanOrEqual(3);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...created].sort());
    expect(seen.slice(-2)).toEqual(created.slice(-2));

    expect((await client().get("/api/exercises?pageSize=51")).status).toBe(400);
    expect((await client().get("/api/exercises?pageSize=0")).status).toBe(400);
    expect((await client().get("/api/exercises?cursor=nao-e-um-cursor")).status).toBe(400);
    expect((await client().get("/api/exercises?modelo=x")).status).toBe(400);
  });

  it("010/SC-008 sem pageSize a página tem o padrão e nunca o banco inteiro", async () => {
    for (let i = 0; i < 55; i += 1) await createExercise(t, teacher.id, { statement: `Exercício ${i}` });
    const first = await list();
    expect(first.items.length).toBe(20);
    expect(first.nextCursor).not.toBeNull();
    const max = await list({ pageSize: 50 });
    expect(max.items.length).toBe(50);
    const rest = await list({ pageSize: 50, cursor: max.nextCursor! });
    expect(rest.items.length).toBe(5);
    expect(rest.nextCursor).toBeNull();
  });

  it("010/US5-3 editar um APPROVED valida de novo, é auditado e continua APPROVED", async () => {
    const { heranca } = await seedBank();
    const before = await view(heranca.id);
    const body = {
      type: "MULTIPLE_CHOICE",
      statement: "Explique a herança simples em Java",
      explanation: before.explanation,
      difficulty: before.difficulty,
      cognitiveObjective: before.cognitiveObjective,
      syllabusItemId: poo.itemId,
      alternatives: before.alternatives.map(({ text, isCorrect }) => ({ text, isCorrect })),
      isTrickQuestion: false,
      version: before.version,
    };
    const invalid = await client().put(`/api/exercises/${heranca.id}`, { ...body, alternatives: body.alternatives.map((a) => ({ ...a, isCorrect: false })) });
    expect(invalid.status).toBe(400);

    const res = await client().put(`/api/exercises/${heranca.id}`, body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "APPROVED", statement: body.statement, version: before.version + 1 });
    const [edited] = await audits("exercise.edited");
    expect(edited?.metadata).toEqual({ origin: "MANUAL", status: "APPROVED", fields: ["statement"], testCaseCount: 0, publicTestCaseCount: 0 });
    // The search key follows the new statement.
    expect(statements(await list({ query: "heranca simples" }))).toEqual([body.statement]);
  });

  it("010/US5-4 arquivar tira da consulta padrão, bloqueia edição e aprovação, e restaurar volta ao estado anterior", async () => {
    const { heranca, semAcento } = await seedBank();

    const archived = await client().post(`/api/exercises/${heranca.id}/archive`, { version: 1 });
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ status: "ARCHIVED", archivedFromStatus: "APPROVED", version: 2 });
    expect((await list()).items.map((item) => item.id)).not.toContain(heranca.id);
    expect((await list({ status: "ARCHIVED" })).items.map((item) => item.id)).toContain(heranca.id);

    // Archiving again changes nothing and records nothing; a stale version is a conflict.
    expect((await client().post(`/api/exercises/${heranca.id}/archive`, { version: 2 })).body).toMatchObject({ status: "ARCHIVED", version: 2 });
    expect((await client().post(`/api/exercises/${heranca.id}/archive`, { version: 1 })).body.code).toBe("EXERCISE_VERSION_CONFLICT");
    expect((await audits("exercise.archived")).map((event) => event.metadata)).toEqual([{ from: "APPROVED" }]);

    const current = await view(heranca.id);
    const edit = await client().put(`/api/exercises/${heranca.id}`, {
      type: "MULTIPLE_CHOICE",
      statement: "Outro",
      explanation: current.explanation,
      difficulty: current.difficulty,
      cognitiveObjective: current.cognitiveObjective,
      alternatives: current.alternatives.map(({ text, isCorrect }) => ({ text, isCorrect })),
      isTrickQuestion: false,
      version: 2,
    });
    expect([edit.status, edit.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
    const approve = await client().post(`/api/exercises/${heranca.id}/approve`, { version: 2 });
    expect([approve.status, approve.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);

    const restored = await client().post(`/api/exercises/${heranca.id}/restore`, { version: 2 });
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ status: "APPROVED", archivedFromStatus: null, version: 3 });
    expect((await audits("exercise.restored")).map((event) => event.metadata)).toEqual([{ to: "APPROVED" }]);
    // Restoring what isn't archived is an invalid transition.
    const again = await client().post(`/api/exercises/${heranca.id}/restore`, { version: 3 });
    expect([again.status, again.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);

    // A DRAFT goes back to DRAFT.
    expect((await client().post(`/api/exercises/${semAcento.id}/archive`, { version: 1 })).body).toMatchObject({ status: "ARCHIVED", archivedFromStatus: "DRAFT" });
    expect((await client().post(`/api/exercises/${semAcento.id}/restore`, { version: 2 })).body).toMatchObject({ status: "DRAFT", archivedFromStatus: null });
    expect((await audits("exercise.archived")).map((event) => event.metadata)).toEqual([{ from: "APPROVED" }, { from: "DRAFT" }]);
  });

  it("010/US5-4 arquivar um rascunho de lote em revisão conta no lote; restaurar desconta", async () => {
    const { gerado, batch } = await seedBank();
    expect((await client().post(`/api/exercises/${gerado.id}/archive`, { version: 1 })).status).toBe(200);
    const archivedView = await client().get(`/api/exercise-batches/${batch.id}`);
    expect(archivedView.body.batch).toMatchObject({ archived: 1, pendingReview: 0 });
    expect((await client().post(`/api/exercises/${gerado.id}/restore`, { version: 2 })).body).toMatchObject({ status: "DRAFT", origin: "AI_GENERATED" });
    const restoredView = await client().get(`/api/exercise-batches/${batch.id}`);
    expect(restoredView.body.batch).toMatchObject({ archived: 0, pendingReview: 1 });
  });

  it("010/US5-5 010/SC-007 o professor B recebe 404 em toda rota sobre um exercício de A e não o vê na consulta", async () => {
    const { heranca, gerado } = await seedBank();
    const b = api(t, { cookie: await loginAs(t, other) });
    const current = await view(heranca.id);
    const edit = {
      type: "MULTIPLE_CHOICE",
      statement: "Tomado",
      explanation: current.explanation,
      difficulty: current.difficulty,
      cognitiveObjective: current.cognitiveObjective,
      alternatives: current.alternatives.map(({ text, isCorrect }) => ({ text, isCorrect })),
      isTrickQuestion: false,
      version: 1,
    };
    const answers = [
      await b.get(`/api/exercises/${heranca.id}`),
      await b.put(`/api/exercises/${heranca.id}`, edit),
      await b.post(`/api/exercises/${gerado.id}/approve`, { version: 1 }),
      await b.post(`/api/exercises/${heranca.id}/archive`, { version: 1 }),
      await b.post(`/api/exercises/${heranca.id}/restore`, { version: 1 }),
      await b.delete(`/api/exercises/${gerado.id}`, { version: 1 }),
    ];
    expect(answers.map((res) => [res.status, res.body?.code])).toEqual(answers.map(() => [404, "NOT_FOUND"]));

    const bList = await b.get("/api/exercises?query=heranca");
    expect(bList.body.items.map((item: ExerciseTeacherView) => item.statement)).toEqual(["Herança do professor B"]);
    // Nothing of A changed.
    expect(await view(heranca.id)).toMatchObject({ status: "APPROVED", version: 1, statement: "Explique a Herança em Java" });
    expect(await view(gerado.id)).toMatchObject({ status: "DRAFT", version: 1 });
  });
});
