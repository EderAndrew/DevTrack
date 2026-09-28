import type { ExerciseBatchRequest } from "@repo/contracts";
import { randomUUID } from "node:crypto";
import { type AgentDefinition, defineAgent, defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { curriculumAiDefinitions } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { EXERCISE_GENERATION_TASK, EXERCISE_GENERATOR, exerciseAiDefinitions } from "../../src/modules/exercise-ai/definitions/exercise-generator";
import { READ_EXERCISE_GENERATION_REQUEST } from "../../src/modules/exercise-ai/generation/request-content";
import { type FakeModelProvider, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiTestApp } from "./ai";
import { TEST_CURRICULUM_AGENT, TEST_CURRICULUM_MODEL_CONFIG } from "./curriculum-ai";
import type { ConfirmedTopic } from "./exercises";
import { api, type TestApp, type TestAppOptions } from "./test-app";

/** The real `exercise-generator`, registered ACTIVE (production starts it DISABLED). */
export const TEST_EXERCISE_GENERATOR: AgentDefinition = defineAgent({ ...EXERCISE_GENERATOR, initialStatus: "ACTIVE" });

/**
 * The test catalog entry of the Curriculum Agent, approved for `exercise-generation` too, with
 * metrics meeting its thresholds: the policy picks it for both tasks (010 research X7).
 */
export const TEST_EXERCISE_MODEL_CONFIG = defineCatalogModel({
  ...TEST_CURRICULUM_MODEL_CONFIG,
  approvals: [
    ...(TEST_CURRICULUM_MODEL_CONFIG.approvals ?? []),
    {
      taskKey: EXERCISE_GENERATION_TASK.key,
      metrics: { ...EXERCISE_GENERATION_TASK.quality },
      evaluatedAt: "2026-09-28T00:00:00.000Z",
      evidence: "apps/api/test/helpers/exercise-ai.ts",
    },
  ],
});

/**
 * `createAiTestApp` with every domain agent (007 curriculum, 010 generator) on the fake provider:
 * the exercise flows need the syllabus ones, and the journey runs both.
 */
export function createExerciseAiApp(options: TestAppOptions = {}): Promise<AiTestApp> {
  const curriculum = curriculumAiDefinitions();
  const exercises = exerciseAiDefinitions();
  return createAiTestApp({
    ...options,
    agents: [TEST_CURRICULUM_AGENT, TEST_EXERCISE_GENERATOR],
    tools: [...curriculum.tools, ...exercises.tools],
    modelConfigs: [TEST_EXERCISE_MODEL_CONFIG],
    tasks: [...curriculum.tasks, ...exercises.tasks],
    resources: { ...curriculum.resources, ...exercises.resources },
  });
}

/** Programs one generation: call 1 reads the batch's request, call 2 answers `output`. */
export function scriptGeneration(fake: FakeModelProvider, batchId: string, output: unknown): void {
  fake.script(fakeToolCall(READ_EXERCISE_GENERATION_REQUEST, { batchId }), fakeOutput(output));
}

/** A valid request body on `topic`: 3 open answers by default, fresh idempotency key. */
export function batchRequest(topic: Pick<ConfirmedTopic, "revision" | "itemId">, overrides: Partial<ExerciseBatchRequest> = {}): ExerciseBatchRequest {
  return {
    syllabusRevisionId: topic.revision.id,
    syllabusItemId: topic.itemId,
    difficulty: "INTERMEDIATE",
    total: 3,
    types: ["OPEN_ANSWER"],
    distribution: { mode: "AUTO" },
    trickQuestions: 0,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

/** `POST /api/exercise-batches`. */
export function requestBatch(t: TestApp, cookie: string, body: object) {
  return api(t, { cookie }).post("/api/exercise-batches", body);
}
