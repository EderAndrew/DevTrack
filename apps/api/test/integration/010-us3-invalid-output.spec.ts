import type { GeneratedExercise, GeneratedExerciseBatch } from "@repo/contracts";
import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { AuditService } from "../../src/modules/audit/audit.service";
import { EXERCISE_GENERATION_TASK } from "../../src/modules/exercise-ai/definitions/exercise-generator";
import { READ_EXERCISE_GENERATION_REQUEST } from "../../src/modules/exercise-ai/generation/request-content";
import { fakeOutput, fakeText, fakeToolCall, type FakeStep } from "../fixtures/ai/fake-model-provider";
import { validGeneratedBatch, type GenerationRequestShape } from "../fixtures/exercise-generation/valid-batch";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { batchRequest, createExerciseAiApp, requestBatch, scriptGeneration, TEST_EXERCISE_MODEL_CONFIG } from "../helpers/exercise-ai";
import { type ConfirmedTopic, createConfirmedTopic } from "../helpers/exercises";
import { createUser, loginAs } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";

/**
 * 010/US3 — an AI answer that doesn't match the batch never reaches the bank: the schema, then the
 * batch's request (research X10), both before any write; the batch ends FAILED with no exercise and
 * no alternative, and a failure inside `materialize` rolls everything back (010/FR-028–FR-032).
 */

const config = { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, exerciseAiPerHour: 100 } };

/** 1 open answer, 2 multiple choice (1 trick question) and 2 code exercises in Java, Intermediário. */
const SHAPE: GenerationRequestShape = { difficulty: "INTERMEDIATE", counts: { OPEN_ANSWER: 1, MULTIPLE_CHOICE: 2, CODE: 2 }, trickQuestions: 1, language: "Java" };
const MARKER = "MARCADOR-SAIDA-INVALIDA-010";
const valid = () => validGeneratedBatch(SHAPE, MARKER);
const MC = 1; // the first multiple-choice exercise, a trick question
const CODE = 3; // the first code exercise

function patched(index: number, patch: (exercise: GeneratedExercise) => unknown): GeneratedExerciseBatch {
  const exercises = [...valid().exercises];
  exercises[index] = patch(exercises[index]!) as GeneratedExercise;
  return { exercises };
}
const alternatives = (texts: [string, boolean][]) => (exercise: GeneratedExercise) => ({
  ...exercise,
  alternatives: texts.map(([text, isCorrect]) => ({ text, isCorrect })),
});

/** An approved STANDARD entry for `exercise-generation`: the escalation's target (009 research H9). */
const STANDARD_MODEL = "anthropic/modelo-standard-teste-010";
const TEST_EXERCISE_STANDARD = defineCatalogModel({
  ...TEST_EXERCISE_MODEL_CONFIG,
  key: "fake-exercise-standard",
  model: STANDARD_MODEL,
  tier: "STANDARD",
  approvals: (TEST_EXERCISE_MODEL_CONFIG.approvals ?? []).filter((approval) => approval.taskKey === EXERCISE_GENERATION_TASK.key),
});

async function setup(t: AiTestApp) {
  await resetAiDb(t);
  const teacher = await createUser(t, { roles: ["TEACHER"] });
  const cookie = await loginAs(t, teacher);
  const topic = await createConfirmedTopic(t, teacher.id, { languageKey: "java" });
  return { cookie, topic };
}

/** Requests the SHAPE batch on `topic`, returning its id. */
async function request(t: AiTestApp, cookie: string, topic: ConfirmedTopic): Promise<string> {
  const res = await requestBatch(
    t,
    cookie,
    batchRequest(topic, {
      total: 5,
      types: ["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"],
      distribution: { mode: "MANUAL", counts: SHAPE.counts },
      trickQuestions: 1,
    }),
  );
  expect(res.status).toBe(202);
  return res.body.id as string;
}

/** Nothing of the batch was written: no exercise, alternative or proposal, and no `generated_at`. */
async function expectNothingWritten(t: AiTestApp, batchId: string) {
  expect(await t.prisma.exercise.count()).toBe(0);
  expect(await t.prisma.exerciseAlternative.count()).toBe(0);
  expect(await t.prisma.aiProposal.count()).toBe(0);
  expect(await t.prisma.auditEvent.count({ where: { type: { in: ["exercise_batch.generated", "ai_proposal.created"] } } })).toBe(0);
  expect((await t.prisma.exerciseGenerationBatch.findUniqueOrThrow({ where: { id: batchId } })).generatedAt).toBeNull();
}

describe("010/US3 resposta da IA inválida nunca entra no banco", () => {
  let t: AiTestApp;
  let cookie: string;
  let topic: ConfirmedTopic;

  beforeAll(async () => {
    t = await createExerciseAiApp({ config });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    ({ cookie, topic } = await setup(t));
  });

  /** Runs one generation that answers `output` and returns the batch as the teacher sees it. */
  async function generate(answer: FakeStep) {
    const batchId = await request(t, cookie, topic);
    t.provider.script(fakeToolCall(READ_EXERCISE_GENERATION_REQUEST, { batchId }), answer);
    await drain(t);
    const detail = await api(t, { cookie }).get(`/api/exercise-batches/${batchId}`);
    expect(detail.status).toBe(200);
    return { batchId, detail: detail.body as { batch: { status: string; failureCode: string | null }; exercises: unknown[] } };
  }

  describe("010/US3-1 resposta fora do esquema → lote FAILED, nada gravado, e o professor pode pedir de novo", () => {
    it.each([
      ["objeto sem os exercícios", fakeOutput({ unexpected: true })],
      ["tipo desconhecido", fakeOutput({ exercises: [{ type: "TRUE_FALSE", statement: "x" }] })],
      ["texto livre", fakeText(`${MARKER}: não é JSON`)],
    ])("%s", async (_, answer) => {
      const { batchId, detail } = await generate(answer);
      expect(detail.batch.status).toBe("FAILED");
      expect(detail.batch.failureCode).toMatch(/^AI_OUTPUT_(VALIDATION|PARSE)_FAILED$/);
      expect(detail.exercises).toEqual([]);
      await expectNothingWritten(t, batchId);
      // No STANDARD model is approved here: the escalation the policy allows has nowhere to go.
      expect((await t.prisma.aiExecution.findFirstOrThrow()).escalationUsed).toBe(false);

      scriptGeneration(t.provider, await request(t, cookie, topic), valid());
      await drain(t);
      expect(await t.prisma.exercise.count()).toBe(5);
    });
  });

  describe("010/US3-2 010/US3-3 010/US3-4 010/US3-5 010/SC-004 resposta que não cumpre o pedido → recusada inteira pelo runner", () => {
    const code = (exercise: GeneratedExercise) => exercise as Extract<GeneratedExercise, { type: "CODE" }>;
    it.each<[string, string, GeneratedExerciseBatch]>([
      ["um exercício a menos", "COUNT_MISMATCH", { exercises: valid().exercises.slice(0, 4) }],
      ["outra distribuição por tipo", "TYPE_MISMATCH", validGeneratedBatch({ ...SHAPE, counts: { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 3, CODE: 2 } }, MARKER)],
      ["outra dificuldade", "DIFFICULTY_MISMATCH", patched(0, (exercise) => ({ ...exercise, difficulty: "BASIC" }))],
      ["uma pegadinha a mais", "TRICK_MISMATCH", patched(MC + 1, (exercise) => ({ ...exercise, isTrickQuestion: true }))],
      ["uma pegadinha a menos", "TRICK_MISMATCH", patched(MC, (exercise) => ({ ...exercise, isTrickQuestion: false }))],
      ["2 alternativas", "STRUCTURE_INVALID", patched(MC, alternatives([["A", true], ["B", false]]))],
      ["6 alternativas", "STRUCTURE_INVALID", patched(MC, alternatives([["A", true], ["B", false], ["C", false], ["D", false], ["E", false], ["F", false]]))],
      ["nenhuma correta", "STRUCTURE_INVALID", patched(MC, alternatives([["A", false], ["B", false], ["C", false]]))],
      ["duas corretas", "STRUCTURE_INVALID", patched(MC, alternatives([["A", true], ["B", true], ["C", false]]))],
      ["alternativas repetidas", "STRUCTURE_INVALID", patched(MC, alternatives([["Herança", true], ["heranca", false], ["C", false]]))],
      ["campo obrigatório vazio", "STRUCTURE_INVALID", patched(CODE, (exercise) => ({ ...code(exercise), expectedSolution: "   " }))],
      ["outra linguagem", "LANGUAGE_MISMATCH", patched(CODE, (exercise) => ({ ...code(exercise), language: "Python" }))],
      ["enunciados iguais", "DUPLICATE_STATEMENT", patched(2, (exercise) => ({ ...exercise, statement: valid().exercises[0]!.statement.toUpperCase() }))],
    ])("%s → FAILED (%s), zero exercícios e alternativas, log só com o código", async (_, reason, output) => {
      // Several apps in one run share Nest's static logger, so the call is checked, not the stream.
      const warn = vi.spyOn(Logger.prototype, "warn");
      const { batchId, detail } = await generate(fakeOutput(output));
      const calls = warn.mock.calls.filter((call) => call[1] === "ai.output_invalid");
      warn.mockRestore();
      expect(detail.batch).toMatchObject({ status: "FAILED", failureCode: "AI_OUTPUT_VALIDATION_FAILED" });
      expect(detail.exercises).toEqual([]);
      await expectNothingWritten(t, batchId);
      expect(calls).toHaveLength(1);
      expect(calls[0]![0]).toMatchObject({ errorCode: "AI_OUTPUT_VALIDATION_FAILED", errorName: "ProposalRejected", rejectReason: reason });
      expect(JSON.stringify(calls)).not.toContain(MARKER);
    });
  });

  it("010/US3-6 um campo de id, tópico ou lote na resposta não cabe no esquema: recusada, nada dela é usado", async () => {
    const withTopic = patched(0, (exercise) => ({ ...exercise, syllabusItemId: topic.itemId, batchId: topic.itemId }));
    const { batchId, detail } = await generate(fakeOutput(withTopic));
    expect(detail.batch.status).toBe("FAILED");
    await expectNothingWritten(t, batchId);
  });

  it("010/US3-7 010/FR-032 falha no materialize → rollback total: lote sem generated_at, sem proposta nem exercícios", async () => {
    const audit = t.get(AuditService);
    const record = audit.record.bind(audit);
    const spy = vi.spyOn(audit, "record").mockImplementation((tx, event) => {
      if (event.type === "exercise_batch.generated") throw new Error(`${MARKER}: falha simulada`);
      return record(tx, event);
    });
    try {
      const batchId = await request(t, cookie, topic);
      scriptGeneration(t.provider, batchId, valid());
      await drain(t);
      // The exercises were inserted before the audit threw: all of them went back with it.
      await expectNothingWritten(t, batchId);
      expect(await t.prisma.aiExecution.findFirstOrThrow()).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED" });
      const detail = await api(t, { cookie }).get(`/api/exercise-batches/${batchId}`);
      expect(detail.body.batch).toMatchObject({ status: "FAILED", generatedAt: null });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("010/US3-1 escalonamento único da 009 quando a política permite", () => {
  let t: AiTestApp;
  let cookie: string;
  let topic: ConfirmedTopic;

  beforeAll(async () => {
    t = await createExerciseAiApp({ config, modelConfigs: [TEST_EXERCISE_STANDARD] });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    ({ cookie, topic } = await setup(t));
  });

  const models = () => t.provider.requests.map((request) => request.model);

  it("fora do esquema no BASIC → uma chamada no STANDARD; a resposta válida vira o lote", async () => {
    const batchId = await request(t, cookie, topic);
    t.provider.script(fakeToolCall(READ_EXERCISE_GENERATION_REQUEST, { batchId }), fakeOutput({ unexpected: true }));
    t.provider.scriptFor(STANDARD_MODEL, fakeOutput(valid()));
    await drain(t);
    expect(models()).toEqual([TEST_EXERCISE_MODEL_CONFIG.model, TEST_EXERCISE_MODEL_CONFIG.model, STANDARD_MODEL]);
    expect(await t.prisma.aiExecution.findFirstOrThrow()).toMatchObject({ status: "COMPLETED", escalationUsed: true, escalationFromTier: "BASIC", escalationToTier: "STANDARD" });
    expect(await t.prisma.exercise.count({ where: { generationBatchId: batchId, status: "DRAFT" } })).toBe(5);
  });

  it("inválida também no STANDARD → FAILED depois de um só escalonamento, nada gravado", async () => {
    const batchId = await request(t, cookie, topic);
    t.provider.script(fakeToolCall(READ_EXERCISE_GENERATION_REQUEST, { batchId }), fakeOutput({ unexpected: true }));
    t.provider.scriptFor(STANDARD_MODEL, fakeOutput({ unexpected: true }), fakeOutput(valid()));
    await drain(t);
    expect(models()).toEqual([TEST_EXERCISE_MODEL_CONFIG.model, TEST_EXERCISE_MODEL_CONFIG.model, STANDARD_MODEL]);
    expect(await t.prisma.aiExecution.findFirstOrThrow()).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED", escalationUsed: true });
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.escalated" } })).toBe(1);
    await expectNothingWritten(t, batchId);
  });
});
