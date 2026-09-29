import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { READ_EXERCISE_GENERATION_REQUEST } from "../../src/modules/exercise-ai/generation/request-content";
import { validGeneratedBatch } from "../fixtures/exercise-generation/valid-batch";
import { fakeOutput, fakeText, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { batchRequest, createExerciseAiApp, requestBatch, scriptGeneration } from "../helpers/exercise-ai";
import { createConfirmedTopic } from "../helpers/exercises";
import { createClass, createUser, loginAs, type TestUser } from "../helpers/factories";
import { testConfig } from "../helpers/test-app";

/**
 * 010/FR-026, research X11: `read-exercise-generation-request` gives the model only the topic and
 * the configuration of the execution's own batch — never the subject's name, other syllabus items,
 * user ids, classes or students — and refuses any other batch.
 */
describe("010/FR-026 escopo da ferramenta read-exercise-generation-request", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;

  beforeAll(async () => {
    t = await createExerciseAiApp({ config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, exerciseAiPerHour: 100 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora MARCADOR-PROFESSORA-010" });
    cookie = await loginAs(t, teacher);
  });

  it("devolve só o item, o grupo, o título, a competência, a linguagem e o pedido; nada de disciplina, outros itens, usuários ou turmas", async () => {
    const topic = await createConfirmedTopic(t, teacher.id, { items: ["Herança e polimorfismo", "MARCADOR-OUTRO-ITEM-010"] });
    await t.prisma.subject.update({ where: { id: topic.subject.id }, data: { name: "MARCADOR-DISCIPLINA-010" } });
    await createClass(t, teacher.id, { name: "MARCADOR-TURMA-010" });

    const res = await requestBatch(t, cookie, batchRequest(topic, { total: 4, types: ["OPEN_ANSWER", "CODE"] }));
    expect(res.status).toBe(202);
    scriptGeneration(t.provider, res.body.id, validGeneratedBatch({ difficulty: "INTERMEDIATE", counts: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 0, CODE: 2 }, trickQuestions: 0, language: "Java" }));
    await drain(t);

    const call = await t.prisma.aiToolCall.findFirstOrThrow({ where: { toolKey: READ_EXERCISE_GENERATION_REQUEST } });
    expect(call.status).toBe("SUCCEEDED");
    // The last request to the model carries the tool's result: the only data it saw.
    const seen = JSON.stringify(t.provider.requests);
    expect(seen).toContain("Herança e polimorfismo");
    expect(seen).toContain("Orientação a objetos");
    expect(seen).toContain("Programação Orientada a Objetos");
    expect(seen).toContain("Java");
    for (const forbidden of ["MARCADOR-DISCIPLINA-010", "MARCADOR-OUTRO-ITEM-010", "MARCADOR-TURMA-010", "MARCADOR-PROFESSORA-010", teacher.id, teacher.email]) {
      expect(seen, forbidden).not.toContain(forbidden);
    }
  });

  it.each([
    ["de outra execução do mesmo professor", "own"],
    ["de outro professor", "other"],
  ] as const)("recusa o lote %s: AI_CONTEXT_ACCESS_DENIED, e a geração falha sem exercícios", async (_, whose) => {
    const topic = await createConfirmedTopic(t, teacher.id);
    const first = await requestBatch(t, cookie, batchRequest(topic));
    let foreignBatchId = first.body.id as string;
    if (whose === "other") {
      const other = await createUser(t, { roles: ["TEACHER"] });
      const otherTopic = await createConfirmedTopic(t, other.id);
      foreignBatchId = (await requestBatch(t, await loginAs(t, other), batchRequest(otherTopic))).body.id;
    }
    // The earlier generations end (an answer that is not JSON), so only the target's runs next.
    t.provider.script(fakeText("não é JSON"));
    await drain(t);
    t.provider.reset();
    const target = await requestBatch(t, cookie, batchRequest(topic));
    // The model asks for another batch than its own.
    t.provider.script(fakeToolCall(READ_EXERCISE_GENERATION_REQUEST, { batchId: foreignBatchId }), fakeOutput({ exercises: [] }));
    await drain(t);

    const execution = await t.prisma.aiExecution.findFirstOrThrow({ where: { resourceId: target.body.id }, include: { toolCallRows: true } });
    expect(execution.toolCallRows.map((row) => [row.toolKey, row.status, row.errorCode])).toEqual([[READ_EXERCISE_GENERATION_REQUEST, "DENIED", "AI_CONTEXT_ACCESS_DENIED"]]);
    expect(execution.status).toBe("FAILED");
    expect(await t.prisma.exercise.count()).toBe(0);
    expect((await t.prisma.exerciseGenerationBatch.findUniqueOrThrow({ where: { id: target.body.id } })).generatedAt).toBeNull();
  });
});
