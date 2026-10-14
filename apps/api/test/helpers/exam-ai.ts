import { randomUUID } from "node:crypto";
import type { CreateExamGenerationRequest } from "@repo/contracts";
import { type AgentDefinition, defineAgent, defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { curriculumAiDefinitions } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { EXAM_GENERATION_TASK, EXAM_GENERATOR, examAiDefinitions } from "../../src/modules/exam-ai/definitions/exam-generator";
import { READ_EXAM_GENERATION_REQUEST } from "../../src/modules/exam-ai/generation/request-content";
import { exerciseAiDefinitions } from "../../src/modules/exercise-ai/definitions/exercise-generator";
import { workAiDefinitions } from "../../src/modules/work-ai/definitions/work-generator";
import { type FakeModelProvider, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiExtraDefinitions, type AiTestApp, createAiTestApp } from "./ai";
import { TEST_CURRICULUM_AGENT } from "./curriculum-ai";
import { TEST_EXERCISE_GENERATOR } from "./exercise-ai";
import type { api, TestAppOptions } from "./test-app";
import { TEST_WORK_GENERATOR, TEST_WORK_MODEL_CONFIG } from "./work-ai";
import type { ConfirmedSyllabus } from "./works";

// ── 018/US7: "Criar prova com IA" (contracts/http-api.md, contracts/exam-generator.md) ──

type ApiClient = ReturnType<typeof api>;

/** The real `exam-generator`, registered ACTIVE (production starts it DISABLED). */
export const TEST_EXAM_GENERATOR: AgentDefinition = defineAgent({ ...EXAM_GENERATOR, initialStatus: "ACTIVE" });

/** The test approval of `exam-generation`, with metrics meeting its thresholds. */
export const EXAM_GENERATION_TEST_APPROVAL = {
  taskKey: EXAM_GENERATION_TASK.key,
  metrics: { ...EXAM_GENERATION_TASK.quality },
  evaluatedAt: "2026-10-13T00:00:00.000Z",
  evidence: "apps/api/test/helpers/exam-ai.ts",
};

/** The test catalog entry of the earlier agents, approved for `exam-generation` too: the policy picks it. */
export const TEST_EXAM_MODEL_CONFIG = defineCatalogModel({
  ...TEST_WORK_MODEL_CONFIG,
  approvals: [...(TEST_WORK_MODEL_CONFIG.approvals ?? []), EXAM_GENERATION_TEST_APPROVAL],
});

/** `createAiTestApp` with the 007, 010, 011 and 018 generators ACTIVE on the fake provider. */
export function createExamAiApp(options: TestAppOptions & Pick<AiExtraDefinitions, "modelConfigs"> = {}): Promise<AiTestApp> {
  const curriculum = curriculumAiDefinitions();
  const exercises = exerciseAiDefinitions();
  const works = workAiDefinitions();
  const exams = examAiDefinitions();
  return createAiTestApp({
    ...options,
    agents: [TEST_CURRICULUM_AGENT, TEST_EXERCISE_GENERATOR, TEST_WORK_GENERATOR, TEST_EXAM_GENERATOR],
    tools: [...curriculum.tools, ...exercises.tools, ...works.tools, ...exams.tools],
    modelConfigs: [TEST_EXAM_MODEL_CONFIG, ...(options.modelConfigs ?? [])],
    tasks: [...curriculum.tasks, ...exercises.tasks, ...works.tasks, ...exams.tasks],
    resources: { ...curriculum.resources, ...exercises.resources, ...works.resources, ...exams.resources },
  });
}

/** Programs one generation: call 1 reads the request, call 2 answers `output`. */
export function scriptExamGeneration(fake: FakeModelProvider, requestId: string, output: unknown): void {
  fake.script(fakeToolCall(READ_EXAM_GENERATION_REQUEST, { requestId }), fakeOutput(output));
}

/** A valid request body on `syllabus`: its first item, 5 open answers, Intermediário, "10.00", fresh key. */
export function examGenerationRequest(
  syllabus: Pick<ConfirmedSyllabus, "subject" | "revision" | "itemIds">,
  overrides: Partial<CreateExamGenerationRequest> = {},
): CreateExamGenerationRequest {
  return {
    subjectId: syllabus.subject.id,
    syllabusRevisionId: syllabus.revision.id,
    topicIds: [syllabus.itemIds[0]!],
    title: "Prova de POO",
    difficulty: "INTERMEDIATE",
    totalGrade: "10.00",
    quantity: 5,
    distribution: { OPEN_ANSWER: 5, MULTIPLE_CHOICE: 0, CODE: 0 },
    trickCount: 0,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

/** `POST /api/exam-generation-requests`. */
export const requestExamGeneration = (client: ApiClient, body: object) => client.post("/api/exam-generation-requests", body);
/** `GET /api/exam-generation-requests/:id`. */
export const getExamGeneration = (client: ApiClient, id: string) => client.get(`/api/exam-generation-requests/${id}`);
