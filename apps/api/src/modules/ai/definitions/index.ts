import type { AppConfig } from "../../../platform/config/config.schema";
import { curriculumAiDefinitions } from "../../curriculum-ai/definitions/curriculum-agent";
import { exerciseAiDefinitions } from "../../exercise-ai/definitions/exercise-generator";
import { OpenRouterProvider } from "../gateway/providers/openrouter.provider";
import { MODEL_CATALOG } from "./model-catalog";
import { PRODUCTION_MODEL_FAMILIES } from "./model-families";
import type { AiDefinitions } from "./types";

/**
 * The AI definitions of production (007 research C12.7, 009 research H2): the Curriculum Agent and
 * (010) the exercise generator, each registered DISABLED until the admin enables it after its
 * eval (007 FR-051), their task policies and resources, the
 * model catalog and the three families of the allowlist, and the provider only with its key.
 * Without it the app starts, and requests answer `AI_MODEL_UNAVAILABLE`. `OPENROUTER_TIMEOUT_MS`
 * caps each catalog entry's timeout. Tests replace this value with `apps/api/test/fixtures/ai`.
 */
export function productionAiDefinitions(config: AppConfig): AiDefinitions {
  const { apiKey, baseUrl, timeoutMs } = config.ai.openrouter;
  const curriculum = curriculumAiDefinitions();
  const exercises = exerciseAiDefinitions();
  return {
    agents: [...curriculum.agents, ...exercises.agents],
    tools: [...curriculum.tools, ...exercises.tools],
    tasks: [...curriculum.tasks, ...exercises.tasks],
    resources: { ...curriculum.resources, ...exercises.resources },
    modelConfigs: MODEL_CATALOG.map((entry) => ({ ...entry, timeoutMs: Math.min(entry.timeoutMs, timeoutMs) })),
    families: PRODUCTION_MODEL_FAMILIES,
    providers: apiKey ? [new OpenRouterProvider({ apiKey, baseUrl })] : [],
  };
}
