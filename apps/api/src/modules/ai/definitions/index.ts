import type { AppConfig } from "../../../platform/config/config.schema";
import { curriculumAiDefinitions } from "../../curriculum-ai/definitions/curriculum-agent";
import { OpenRouterProvider } from "../gateway/providers/openrouter.provider";
import { MODEL_CATALOG } from "./model-catalog";
import { PRODUCTION_MODEL_FAMILIES } from "./model-families";
import type { AiDefinitions } from "./types";

/**
 * The AI definitions of production (007 research C12.7, 009 research H2): the Curriculum Agent,
 * registered DISABLED until the admin enables it after the eval (FR-051), its task policies, the
 * model catalog and the three families of the allowlist, and the provider only with its key.
 * Without it the app starts, and requests answer `AI_MODEL_UNAVAILABLE`. `OPENROUTER_TIMEOUT_MS`
 * caps each catalog entry's timeout. Tests replace this value with `apps/api/test/fixtures/ai`.
 */
export function productionAiDefinitions(config: AppConfig): AiDefinitions {
  const { apiKey, baseUrl, timeoutMs } = config.ai.openrouter;
  return {
    ...curriculumAiDefinitions(),
    modelConfigs: MODEL_CATALOG.map((entry) => ({ ...entry, timeoutMs: Math.min(entry.timeoutMs, timeoutMs) })),
    families: PRODUCTION_MODEL_FAMILIES,
    providers: apiKey ? [new OpenRouterProvider({ apiKey, baseUrl })] : [],
  };
}
