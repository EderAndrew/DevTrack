import { randomUUID } from "node:crypto";
import type { RequestHelp, WorkHelperOutput } from "@repo/contracts";
import { type AgentDefinition, defineAgent, defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { curriculumAiDefinitions } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { exerciseAiDefinitions } from "../../src/modules/exercise-ai/definitions/exercise-generator";
import { workAiDefinitions } from "../../src/modules/work-ai/definitions/work-generator";
import { WORK_HELPER_KEY, workHelpDefinitions } from "../../src/modules/work-help/definitions/work-helper";
import { type FakeModelProvider, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { REFERENCE_L1 } from "../fixtures/ai/reference-agents";
import { type AiExtraDefinitions, type AiTestApp, createAiTestApp } from "./ai";
import { TEST_CURRICULUM_AGENT } from "./curriculum-ai";
import { TEST_EXERCISE_GENERATOR } from "./exercise-ai";
import type { api, TestAppOptions } from "./test-app";
import { TEST_WORK_GENERATOR, TEST_WORK_MODEL_CONFIG } from "./work-ai";

// ── 015: the AI help (contracts/http-api.md, contracts/work-helper.md), for the US1, US3 and US4 suites ──

type ApiClient = ReturnType<typeof api>;

/** The key of the `work-helper`'s read tool (contracts/work-helper.md). */
export const READ_WORK_HELP_REQUEST = "read-work-help-request";

/**
 * Until the real `work-helper` arrives (US3, T034): a read-only reference agent under its key, on the
 * reference task, so the availability of US1 (research F3) has an agent and a route to look at. It
 * leaves with US3, when `workHelpDefinitions()` registers the agent.
 */
const WORK_HELPER_STAND_IN = defineAgent({
  ...REFERENCE_L1,
  key: WORK_HELPER_KEY,
  name: "Ajuda da IA (substituto de teste até a US3)",
  prompt: { ...REFERENCE_L1.prompt, key: "work-helper-stand-in" },
});

/** The 015 agents (the real `work-helper` since US3), registered ACTIVE (production starts them DISABLED). */
export const testWorkHelpAgents = (): AgentDefinition[] => {
  const agents = workHelpDefinitions().agents;
  return (agents.length > 0 ? agents : [WORK_HELPER_STAND_IN]).map((agent) => defineAgent({ ...agent, initialStatus: "ACTIVE" }));
};

/**
 * The test catalog entry of the earlier agents, approved for the 015 tasks too (`work-help` since
 * US3), with metrics meeting each task's thresholds: the policy picks it for every task.
 */
export const TEST_WORK_HELP_MODEL_CONFIG = defineCatalogModel({
  ...TEST_WORK_MODEL_CONFIG,
  approvals: [
    ...(TEST_WORK_MODEL_CONFIG.approvals ?? []),
    ...workHelpDefinitions().tasks.map((task) => ({
      taskKey: task.key,
      metrics: { ...task.quality },
      evaluatedAt: "2026-10-07T00:00:00.000Z",
      evidence: "apps/api/test/helpers/work-help.ts",
    })),
  ],
});

/** `createAiTestApp` with every domain agent (007, 010, 011, 015) ACTIVE on the fake provider. */
export function createWorkHelpApp(options: TestAppOptions & Pick<AiExtraDefinitions, "modelConfigs"> = {}): Promise<AiTestApp> {
  const curriculum = curriculumAiDefinitions();
  const exercises = exerciseAiDefinitions();
  const works = workAiDefinitions();
  const help = workHelpDefinitions();
  return createAiTestApp({
    ...options,
    agents: [TEST_CURRICULUM_AGENT, TEST_EXERCISE_GENERATOR, TEST_WORK_GENERATOR, ...testWorkHelpAgents()],
    tools: [...curriculum.tools, ...exercises.tools, ...works.tools, ...help.tools],
    modelConfigs: [TEST_WORK_HELP_MODEL_CONFIG, ...(options.modelConfigs ?? [])],
    tasks: [...curriculum.tasks, ...exercises.tasks, ...works.tasks, ...help.tasks],
    resources: { ...curriculum.resources, ...exercises.resources, ...works.resources, ...help.resources },
  });
}

/** Programs one help: call 1 reads the request, call 2 answers `output`. */
export function scriptHelp(fake: FakeModelProvider, requestId: string, output: WorkHelperOutput): void {
  fake.script(fakeToolCall(READ_WORK_HELP_REQUEST, { requestId }), fakeOutput(output));
}

/** A valid orientation that quotes no alternative, expected answer or solution (passes the leak check, F10). */
export function validGuidance(overrides: Partial<WorkHelperOutput> = {}): WorkHelperOutput {
  return {
    outcome: "GUIDANCE",
    message: "Pense no que o enunciado pede antes de escrever: quais dados entram e o que precisa sair? Tente descrever os passos em português primeiro.",
    example: null,
    ...overrides,
  };
}

/** `GET /work-help/availability` as the teacher of `client` (research F3). */
export function getHelpAvailability(client: ApiClient) {
  return client.get("/api/work-help/availability");
}

/** `POST /me/activities/:activityId/attempt/help` as the student of `client`; a fresh idempotency key unless given. */
export function requestHelp(client: ApiClient, activityId: string, body: Omit<RequestHelp, "idempotencyKey"> & { idempotencyKey?: string }) {
  return client.post(`/api/me/activities/${activityId}/attempt/help`, { idempotencyKey: randomUUID(), ...body });
}

/** `GET /me/activities/:activityId/attempt/help`: allowance, used, pending and the student's items. */
export function getHelp(client: ApiClient, activityId: string) {
  return client.get(`/api/me/activities/${activityId}/attempt/help`);
}
