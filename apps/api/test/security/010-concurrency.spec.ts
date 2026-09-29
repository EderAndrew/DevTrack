import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { batchRequest, createExerciseAiApp, requestBatch } from "../helpers/exercise-ai";
import { createConfirmedTopic, createExercise, createGenerationBatch } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";

const PARALLEL = 5;
const config = { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, exerciseAiPerHour: 100 } };

/**
 * 010/US4-7: two tabs acting on the same exercise — only one change counts, the other gets
 * `409 EXERCISE_VERSION_CONFLICT` (research X14: the exercise's version, checked under its row lock);
 * equal batch requests at once make one batch (UNIQUE teacher + idempotency key).
 */
describe("010/US4-7 concorrência no banco de exercícios", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;

  beforeAll(async () => {
    t = await createExerciseAiApp({ config });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
  });

  const client = () => api(t, { cookie });
  const statuses = (responses: { status: number }[]) => responses.map((res) => res.status).sort();

  it("aprovações simultâneas do mesmo exercício → uma vale, as outras 409 EXERCISE_VERSION_CONFLICT", async () => {
    const exercise = await createExercise(t, teacher.id, { status: "DRAFT" });
    const responses = await Promise.all(Array.from({ length: PARALLEL }, () => client().post(`/api/exercises/${exercise.id}/approve`, { version: 1 })));
    expect(statuses(responses)).toEqual([200, ...Array(PARALLEL - 1).fill(409)]);
    expect(responses.filter((res) => res.status === 409).every((res) => res.body.code === "EXERCISE_VERSION_CONFLICT")).toBe(true);
    expect(await t.prisma.auditEvent.count({ where: { type: "exercise.approved" } })).toBe(1);
    expect(await t.prisma.exercise.findUniqueOrThrow({ where: { id: exercise.id } })).toMatchObject({ status: "APPROVED", version: 2 });
  });

  it("edições simultâneas → uma vale; o texto é o dela e a versão sobe uma vez", async () => {
    const exercise = await createExercise(t, teacher.id, { type: "OPEN_ANSWER", status: "DRAFT" });
    const body = (n: number) => ({
      type: "OPEN_ANSWER",
      statement: `Enunciado da aba ${n}`,
      explanation: "Explicação",
      difficulty: "BASIC",
      cognitiveObjective: "UNDERSTAND",
      expectedAnswer: "Resposta",
      version: 1,
    });
    const responses = await Promise.all(Array.from({ length: PARALLEL }, (_, n) => client().put(`/api/exercises/${exercise.id}`, body(n))));
    expect(statuses(responses)).toEqual([200, ...Array(PARALLEL - 1).fill(409)]);
    const winner = responses.find((res) => res.status === 200)!;
    const row = await t.prisma.exercise.findUniqueOrThrow({ where: { id: exercise.id } });
    expect(row).toMatchObject({ statement: winner.body.statement, version: 2 });
    expect(await t.prisma.auditEvent.count({ where: { type: "exercise.edited" } })).toBe(1);
  });

  it("aprovar e excluir o mesmo rascunho do lote ao mesmo tempo → só um acontece, e as contagens batem", async () => {
    const topic = await createConfirmedTopic(t, teacher.id, { languageKey: null });
    const batch = await createGenerationBatch(t, teacher.id, topic, { counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 0 }, generatedAt: new Date() });
    const exercise = await createExercise(t, teacher.id, {
      origin: "AI_GENERATED",
      status: "DRAFT",
      syllabusItemId: topic.itemId,
      generationBatchId: batch.id,
    });
    const [approve, remove] = await Promise.all([
      client().post(`/api/exercises/${exercise.id}/approve`, { version: 1 }),
      client().delete(`/api/exercises/${exercise.id}`, { version: 1 }),
    ]);
    expect([approve.status, remove.status].sort()).toEqual(remove.status === 204 ? [204, 409] : [200, 409]);
    const row = await t.prisma.exerciseGenerationBatch.findUniqueOrThrow({ where: { id: batch.id } });
    const left = await t.prisma.exercise.count({ where: { id: exercise.id } });
    expect([row.approvedCount, row.discardedCount, left]).toEqual(remove.status === 204 ? [0, 1, 0] : [1, 0, 1]);
  });

  it("pedidos iguais simultâneos (mesma chave) → um lote", async () => {
    const topic = await createConfirmedTopic(t, teacher.id, { languageKey: null });
    const body = batchRequest(topic);
    const responses = await Promise.all(Array.from({ length: PARALLEL }, () => requestBatch(t, cookie, body)));
    expect(responses.every((res) => res.status === 200 || res.status === 202)).toBe(true);
    expect(new Set(responses.map((res) => res.body.id)).size).toBe(1);
    expect(await t.prisma.exerciseGenerationBatch.count()).toBe(1);
    expect(await t.prisma.aiExecution.count()).toBe(1);
  });
});
