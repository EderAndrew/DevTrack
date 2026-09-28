import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AiTestApp } from "../helpers/ai";
import { resetAiDb } from "../helpers/ai";
import { batchRequest, createExerciseAiApp } from "../helpers/exercise-ai";
import { type ConfirmedTopic, createConfirmedTopic, createExercise, createGenerationBatch } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };

interface Area {
  teacher: TestUser;
  cookie: string;
  topic: ConfirmedTopic;
  /** MANUAL, APPROVED multiple choice. */
  approvedId: string;
  /** MANUAL, ARCHIVED. */
  archivedId: string;
  batchId: string;
  /** AI_GENERATED DRAFT of the batch. */
  draftId: string;
}

async function area(t: AiTestApp, name: string): Promise<Area> {
  const teacher = await createUser(t, { roles: ["TEACHER"], name: `Professor ${name}` });
  const topic = await createConfirmedTopic(t, teacher.id);
  const approved = await createExercise(t, teacher.id, { statement: `Exercício de ${name}`, syllabusItemId: topic.itemId });
  const archived = await createExercise(t, teacher.id, { status: "ARCHIVED", statement: `Arquivado de ${name}` });
  const batch = await createGenerationBatch(t, teacher.id, topic, { generatedAt: new Date() });
  const draft = await createExercise(t, teacher.id, {
    type: "OPEN_ANSWER",
    origin: "AI_GENERATED",
    status: "DRAFT",
    statement: `Rascunho de ${name}`,
    syllabusItemId: topic.itemId,
    generationBatchId: batch.id,
  });
  return { teacher, cookie: await loginAs(t, teacher), topic, approvedId: approved.id, archivedId: archived.id, batchId: batch.id, draftId: draft.id };
}

/** A valid manual input on `itemId` (its topic is what the check looks at). */
const manualInput = (itemId: string) => ({
  type: "OPEN_ANSWER",
  statement: "Enunciado",
  explanation: "Explicação",
  difficulty: "BASIC",
  cognitiveObjective: "UNDERSTAND",
  expectedAnswer: "Resposta",
  syllabusItemId: itemId,
});

/** Everything a refused call must leave as it was. */
async function snapshot(t: AiTestApp) {
  return {
    exercises: await t.prisma.exercise.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, version: true, statement: true, updatedAt: true } }),
    batches: await t.prisma.exerciseGenerationBatch.findMany({
      orderBy: { id: "asc" },
      select: { id: true, approvedCount: true, discardedCount: true, archivedCount: true },
    }),
    audit: await t.prisma.auditEvent.count({ where: { type: { startsWith: "exercise" } } }),
    executions: await t.prisma.aiExecution.count(),
  };
}

/**
 * 010/SC-007: each teacher's bank is closed to the other. With A's session over B's ids every
 * exercise and batch route answers 404 (never 403, which would reveal the id), and B's topics
 * are 404 as a topic of a manual exercise or a batch. ADMIN, MANAGER and STUDENT have none of
 * the permissions: 403 on every route, before any lookup.
 */
describe("010/SC-007 isolamento do banco de exercícios entre professores", () => {
  let t: AiTestApp;
  let a: Area;
  let b: Area;

  beforeAll(async () => {
    t = await createExerciseAiApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    a = await area(t, "A");
    b = await area(t, "B");
  });

  it("com a sessão de A, toda rota sobre ids de B responde 404 e nada muda", async () => {
    const client = api(t, { cookie: a.cookie });
    const before = await snapshot(t);
    const calls = [
      ["GET exercício", () => client.get(`/api/exercises/${b.approvedId}`)],
      ["PUT exercício", () => client.put(`/api/exercises/${b.draftId}`, { ...manualInput(b.topic.itemId), version: 1 })],
      ["aprovar", () => client.post(`/api/exercises/${b.draftId}/approve`, { version: 1 })],
      ["arquivar", () => client.post(`/api/exercises/${b.approvedId}/archive`, { version: 1 })],
      ["restaurar", () => client.post(`/api/exercises/${b.archivedId}/restore`, { version: 1 })],
      ["excluir rascunho", () => client.delete(`/api/exercises/${b.draftId}`, { version: 1 })],
      ["GET lote", () => client.get(`/api/exercise-batches/${b.batchId}`)],
      ["aprovar do lote", () => client.post(`/api/exercise-batches/${b.batchId}/approve`, { exerciseIds: [b.draftId] })],
      ["aprovar do próprio lote um rascunho de B", () => client.post(`/api/exercise-batches/${a.batchId}/approve`, { exerciseIds: [a.draftId, b.draftId] })],
      ["exercício avulso no tópico de B", () => client.post("/api/exercises", { ...manualInput(b.topic.itemId), status: "APPROVED" })],
      [
        "conjunto no tópico de B",
        () => client.post("/api/exercises/sets", { status: "DRAFT", exercises: [manualInput(a.topic.itemId), manualInput(a.topic.itemId), manualInput(b.topic.itemId)] }),
      ],
      [
        "editar o próprio exercício para o tópico de B",
        () =>
          client.put(`/api/exercises/${a.approvedId}`, {
            type: "MULTIPLE_CHOICE",
            statement: "Enunciado",
            explanation: "Explicação",
            difficulty: "BASIC",
            cognitiveObjective: "UNDERSTAND",
            alternatives: [
              { text: "Certa", isCorrect: true },
              { text: "Errada um", isCorrect: false },
              { text: "Errada dois", isCorrect: false },
            ],
            isTrickQuestion: false,
            syllabusItemId: b.topic.itemId,
            version: 1,
          }),
      ],
      ["gerar no tópico de B", () => client.post("/api/exercise-batches", batchRequest(b.topic))],
      ["gerar de novo a partir de um lote de B", () => client.post("/api/exercise-batches", batchRequest(a.topic, { regeneratedFromId: b.batchId }))],
    ] as const;
    for (const [name, call] of calls) {
      const res = await call();
      expect({ name, status: res.status, body: res.body }).toEqual({ name, status: 404, body: NOT_FOUND });
    }
    expect(await snapshot(t)).toEqual(before);

    // The lists carry only A's own.
    const exercises = await client.get("/api/exercises?status=ARCHIVED");
    expect(exercises.body.items.map((item: { id: string }) => item.id)).toEqual([a.archivedId]);
    const drafts = await client.get("/api/exercises");
    expect(drafts.body.items.map((item: { id: string }) => item.id).sort()).toEqual([a.approvedId, a.draftId].sort());
    const batches = await client.get("/api/exercise-batches");
    expect(batches.body.items.map((item: { id: string }) => item.id)).toEqual([a.batchId]);
  });

  it("ADMIN, MANAGER e ALUNO recebem 403 em toda rota do banco, antes de qualquer busca", async () => {
    const admin = await createUser(t, { roles: ["ADMIN"] });
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const student = await createUser(t, { roles: ["STUDENT"] });
    const before = await snapshot(t);
    for (const user of [admin, manager, student]) {
      const client = api(t, { cookie: await loginAs(t, user) });
      const answers = [
        await client.get("/api/exercises"),
        await client.get(`/api/exercises/${a.approvedId}`),
        await client.post("/api/exercises", { ...manualInput(a.topic.itemId), status: "APPROVED" }),
        await client.post("/api/exercises/sets", { status: "DRAFT", exercises: [1, 2, 3].map(() => manualInput(a.topic.itemId)) }),
        await client.put(`/api/exercises/${a.draftId}`, { ...manualInput(a.topic.itemId), version: 1 }),
        await client.post(`/api/exercises/${a.draftId}/approve`, { version: 1 }),
        await client.post(`/api/exercises/${a.approvedId}/archive`, { version: 1 }),
        await client.post(`/api/exercises/${a.archivedId}/restore`, { version: 1 }),
        await client.delete(`/api/exercises/${a.draftId}`, { version: 1 }),
        await client.get("/api/programming-languages"),
        await client.get("/api/exercise-generation/availability"),
        await client.post("/api/exercise-batches", batchRequest(a.topic)),
        await client.get("/api/exercise-batches"),
        await client.get(`/api/exercise-batches/${a.batchId}`),
        await client.post(`/api/exercise-batches/${a.batchId}/approve`, { exerciseIds: [a.draftId] }),
      ];
      expect(answers.map((res) => res.status)).toEqual(answers.map(() => 403));
    }
    expect(await snapshot(t)).toEqual(before);
  });
});
