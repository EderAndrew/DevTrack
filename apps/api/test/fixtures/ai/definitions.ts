import type { AiDefinitions } from "../../../src/modules/ai/definitions/types";
import { FakeModelProvider } from "./fake-model-provider";
import { REFERENCE_MODEL_CONFIGS } from "./model-configs";
import { REFERENCE_AGENTS } from "./reference-agents";
import { REFERENCE_TOOLS } from "./reference-tools";
import { REFERENCE_RESOURCES } from "./resources";

/**
 * The AI definitions of the tests (006 research A4): the reference agents, their test tools, the
 * fake configs and a fresh fake provider. Overrides `AI_DEFINITIONS` in `createAiTestApp`.
 */
export function referenceAiDefinitions(provider = new FakeModelProvider()): AiDefinitions & { provider: FakeModelProvider } {
  return {
    agents: REFERENCE_AGENTS,
    tools: REFERENCE_TOOLS,
    modelConfigs: REFERENCE_MODEL_CONFIGS,
    providers: [provider],
    resources: REFERENCE_RESOURCES,
    provider,
  };
}
