import type { AiDefinitions } from "./types";

/**
 * The AI definitions of production. Empty on purpose: this feature brings no domain agent and
 * no real provider (006 FR-016); requests answer `AI_AGENT_NOT_FOUND` until the first agent's
 * spec adds itself here. Tests replace this value with `apps/api/test/fixtures/ai`.
 */
export const PRODUCTION_AI_DEFINITIONS: AiDefinitions = {
  agents: [],
  tools: [],
  modelConfigs: [],
  providers: [],
  resources: {},
};
