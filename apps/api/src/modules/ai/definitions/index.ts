import type { AppConfig } from "../../../platform/config/config.schema";
import { curriculumAiDefinitions } from "../../curriculum-ai/definitions/curriculum-agent";
import { AnthropicProvider } from "../gateway/providers/anthropic.provider";
import type { AiDefinitions } from "./types";

/**
 * The AI definitions of production (007 research C12.7): the Curriculum Agent, registered
 * DISABLED until the admin enables it after the eval (FR-051), and the Anthropic provider only
 * when `ANTHROPIC_API_KEY` is set (FR-043). Without the key no provider is registered: the app
 * starts, and requests answer `AI_MODEL_UNAVAILABLE`. Tests replace this value with
 * `apps/api/test/fixtures/ai`.
 */
export function productionAiDefinitions(config: AppConfig): AiDefinitions {
  const { apiKey, baseUrl } = config.ai.anthropic;
  return { ...curriculumAiDefinitions(), providers: apiKey ? [new AnthropicProvider({ apiKey, baseUrl })] : [] };
}
