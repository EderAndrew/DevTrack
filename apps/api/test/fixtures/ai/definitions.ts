import { PRODUCTION_MODEL_FAMILIES } from "../../../src/modules/ai/definitions/model-families";
import type { AiDefinitions } from "../../../src/modules/ai/definitions/types";
import { FakeModelProvider } from "./fake-model-provider";
import { referenceCatalog } from "./model-configs";
import { REFERENCE_AGENTS } from "./reference-agents";
import { REFERENCE_TOOLS } from "./reference-tools";
import { REFERENCE_RESOURCES } from "./resources";
import { REFERENCE_TASKS } from "./tasks";

/** The families of the tests: production's plus `fake`, which never reaches production (009 FR-001). */
export const TEST_MODEL_FAMILIES: readonly string[] = [...PRODUCTION_MODEL_FAMILIES, "fake"];

/**
 * The AI definitions of the tests (006 research A4): the reference agents, their test tools, the
 * fake catalog, their tasks (008, with policies since 009) and a fresh fake provider. Overrides `AI_DEFINITIONS` in `createAiTestApp`.
 */
export function referenceAiDefinitions(provider = new FakeModelProvider()): AiDefinitions & { provider: FakeModelProvider } {
  return {
    agents: REFERENCE_AGENTS,
    tools: REFERENCE_TOOLS,
    modelConfigs: referenceCatalog(),
    tasks: REFERENCE_TASKS,
    families: TEST_MODEL_FAMILIES,
    providers: [provider],
    resources: REFERENCE_RESOURCES,
    provider,
  };
}
