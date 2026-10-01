import type { WorkGenerationRequest } from "@repo/contracts";
import { randomUUID } from "node:crypto";
import { type AgentDefinition, defineAgent, defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { curriculumAiDefinitions } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { exerciseAiDefinitions } from "../../src/modules/exercise-ai/definitions/exercise-generator";
import { WORK_GENERATION_TASK, WORK_GENERATOR, workAiDefinitions } from "../../src/modules/work-ai/definitions/work-generator";
import { READ_WORK_GENERATION_REQUEST } from "../../src/modules/work-ai/generation/request-content";
import { type FakeModelProvider, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiExtraDefinitions, type AiTestApp, createAiTestApp } from "./ai";
import { TEST_CURRICULUM_AGENT } from "./curriculum-ai";
import { TEST_EXERCISE_GENERATOR, TEST_EXERCISE_MODEL_CONFIG } from "./exercise-ai";
import type { ConfirmedSyllabus } from "./works";
import { api, type TestApp, type TestAppOptions } from "./test-app";

/** The real `work-generator`, registered ACTIVE (production starts it DISABLED). */
export const TEST_WORK_GENERATOR: AgentDefinition = defineAgent({ ...WORK_GENERATOR, initialStatus: "ACTIVE" });

/**
 * The test catalog entry of the earlier agents, approved for `work-generation` too, with metrics
 * meeting its thresholds: the policy picks it for every task (011 research W9).
 */
export const TEST_WORK_MODEL_CONFIG = defineCatalogModel({
  ...TEST_EXERCISE_MODEL_CONFIG,
  approvals: [
    ...(TEST_EXERCISE_MODEL_CONFIG.approvals ?? []),
    {
      taskKey: WORK_GENERATION_TASK.key,
      metrics: { ...WORK_GENERATION_TASK.quality },
      evaluatedAt: "2026-09-30T00:00:00.000Z",
      evidence: "apps/api/test/helpers/work-ai.ts",
    },
  ],
});

/** `createAiTestApp` with every domain agent (007, 010, 011) on the fake provider. */
export function createWorkAiApp(options: TestAppOptions & Pick<AiExtraDefinitions, "modelConfigs"> = {}): Promise<AiTestApp> {
  const curriculum = curriculumAiDefinitions();
  const exercises = exerciseAiDefinitions();
  const works = workAiDefinitions();
  return createAiTestApp({
    ...options,
    agents: [TEST_CURRICULUM_AGENT, TEST_EXERCISE_GENERATOR, TEST_WORK_GENERATOR],
    tools: [...curriculum.tools, ...exercises.tools, ...works.tools],
    modelConfigs: [TEST_WORK_MODEL_CONFIG, ...(options.modelConfigs ?? [])],
    tasks: [...curriculum.tasks, ...exercises.tasks, ...works.tasks],
    resources: { ...curriculum.resources, ...exercises.resources, ...works.resources },
  });
}

/** Programs one generation: call 1 reads the request, call 2 answers `output`. */
export function scriptWorkGeneration(fake: FakeModelProvider, requestId: string, output: unknown): void {
  fake.script(fakeToolCall(READ_WORK_GENERATION_REQUEST, { requestId }), fakeOutput(output));
}

/**
 * A valid request body on `syllabus`: its first item, 3 open answers, Intermediário, "3.00",
 * fresh idempotency key.
 */
export function workGenerationRequest(
  syllabus: Pick<ConfirmedSyllabus, "subject" | "revision" | "itemIds">,
  overrides: Partial<WorkGenerationRequest> = {},
): WorkGenerationRequest {
  return {
    subjectId: syllabus.subject.id,
    syllabusRevisionId: syllabus.revision.id,
    syllabusItemIds: [syllabus.itemIds[0]!],
    title: "Trabalho de POO",
    difficulty: "INTERMEDIATE",
    totalGrade: "3.00",
    total: 3,
    types: ["OPEN_ANSWER"],
    distribution: { mode: "AUTO" },
    trickQuestions: 0,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

/** `POST /api/work-generation-requests`. */
export function requestWork(t: TestApp, cookie: string, body: object) {
  return api(t, { cookie }).post("/api/work-generation-requests", body);
}
