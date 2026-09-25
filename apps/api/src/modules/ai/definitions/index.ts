import type { AppConfig } from "../../../platform/config/config.schema";
import { curriculumAiDefinitions } from "../../curriculum-ai/definitions/curriculum-agent";
import type { AiDefinitions } from "./types";

/**
 * The AI definitions of production (007 research C12.7): the Curriculum Agent, registered
 * DISABLED until the admin enables it after the eval (FR-051). No provider yet: requests answer
 * `AI_MODEL_UNAVAILABLE` until the Anthropic provider joins (with `ANTHROPIC_API_KEY`). Tests
 * replace this value with `apps/api/test/fixtures/ai`.
 */
export function productionAiDefinitions(_config: AppConfig): AiDefinitions {
  return { ...curriculumAiDefinitions(), providers: [] };
}
