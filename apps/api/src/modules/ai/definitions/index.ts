import type { AppConfig } from "../../../platform/config/config.schema";
import { CURRICULUM_EXTRACTION_TASK, curriculumAiDefinitions } from "../../curriculum-ai/definitions/curriculum-agent";
import { OpenRouterProvider } from "../gateway/providers/openrouter.provider";
import { DEFAULT_MODEL_CONFIG_KEY, FALLBACK_MODEL_CONFIG_KEY } from "./model-config-keys";
import { type AiDefinitions, defineModelConfig, type ModelConfigDefinition, type ModelConfigUnavailableReason } from "./types";

/** Ceiling of the output tokens of an OpenRouter config; each task sets its own below it. */
const OPENROUTER_MAX_OUTPUT_TOKENS = 32_000;

/** An OpenRouter id (`vendor/model`); `openrouter/*` ids pick other models on their own (008 FR-008). */
const MODEL_ID = /^[a-z0-9-]+\/[a-z0-9._:-]+$/;

export const isValidModelId = (model: string) => MODEL_ID.test(model) && !model.startsWith("openrouter/");

/**
 * Why the routing policy of the environment can't be used, or null (research G16): a model out of
 * format, or a fallback equal to the default. Invalid policy leaves the whole task unavailable.
 */
function policyProblem(openrouter: AppConfig["ai"]["openrouter"]): ModelConfigUnavailableReason | null {
  const models = [openrouter.defaultModel, ...(openrouter.fallbackModel ? [openrouter.fallbackModel] : [])];
  if (!models.every(isValidModelId)) return "MODEL_INVALID";
  if (openrouter.fallbackModel === openrouter.defaultModel) return "FALLBACK_EQUALS_PRIMARY";
  return null;
}

/**
 * The OpenRouter model configs of production (008 research G3): the default model and, when
 * `OPENROUTER_FALLBACK_MODEL` is set, the fallback. Changing a model is changing the variable and
 * restarting; the sync updates the row and each call keeps the model it used. No price: the
 * provider reports the cost of each call (research G17). An invalid policy doesn't stop the API:
 * the configs are synced as unavailable and the task can't run (FR-008).
 */
export function openRouterModelConfigs(openrouter: AppConfig["ai"]["openrouter"]): ModelConfigDefinition[] {
  const unavailableReason = policyProblem(openrouter);
  const config = (key: string, model: string) =>
    defineModelConfig({
      key,
      provider: "openrouter",
      model,
      initialStatus: "ENABLED",
      maxOutputTokens: OPENROUTER_MAX_OUTPUT_TOKENS,
      timeoutMs: openrouter.timeoutMs,
      ...(unavailableReason ? { unavailableReason } : {}),
    });
  return [
    config(DEFAULT_MODEL_CONFIG_KEY, openrouter.defaultModel),
    ...(openrouter.fallbackModel ? [config(FALLBACK_MODEL_CONFIG_KEY, openrouter.fallbackModel)] : []),
  ];
}

/**
 * The AI definitions of production (007 research C12.7, 008 research G3): the Curriculum Agent,
 * registered DISABLED until the admin enables it after the eval (FR-051), its task routed to the
 * OpenRouter configs, and the provider only with its key. Without it the app starts, and requests
 * answer `AI_MODEL_UNAVAILABLE`. Tests replace this value with `apps/api/test/fixtures/ai`.
 */
export function productionAiDefinitions(config: AppConfig): AiDefinitions {
  const { apiKey, baseUrl } = config.ai.openrouter;
  const modelConfigs = openRouterModelConfigs(config.ai.openrouter);
  const fallback = modelConfigs.some((model) => model.key === FALLBACK_MODEL_CONFIG_KEY);
  const curriculum = curriculumAiDefinitions();
  return {
    ...curriculum,
    modelConfigs,
    tasks: curriculum.tasks.map((task) =>
      task.key === CURRICULUM_EXTRACTION_TASK.key && fallback ? { ...task, fallbackModelConfigKey: FALLBACK_MODEL_CONFIG_KEY } : task,
    ),
    providers: apiKey ? [new OpenRouterProvider({ apiKey, baseUrl })] : [],
  };
}
