import type { AppConfig } from "../../../platform/config/config.schema";
import {
  CURRICULUM_EXTRACTION_TASK,
  curriculumAiDefinitions,
  OPENROUTER_DEFAULT_CONFIG_KEY,
  OPENROUTER_FALLBACK_CONFIG_KEY,
} from "../../curriculum-ai/definitions/curriculum-agent";
import { AnthropicProvider } from "../gateway/providers/anthropic.provider";
import { type AiDefinitions, defineModelConfig, type ModelConfigDefinition } from "./types";

/** Ceiling of the output tokens of an OpenRouter config; each task sets its own below it. */
const OPENROUTER_MAX_OUTPUT_TOKENS = 32_000;

/**
 * The OpenRouter model configs of production (008 research G3): the default model and, when
 * `OPENROUTER_FALLBACK_MODEL` is set, the fallback. Changing a model is changing the variable and
 * restarting; the sync updates the row and each call keeps the model it used. No price: the
 * provider reports the cost of each call (research G17).
 */
export function openRouterModelConfigs(openrouter: AppConfig["ai"]["openrouter"]): ModelConfigDefinition[] {
  const config = (key: string, model: string) =>
    defineModelConfig({
      key,
      provider: "openrouter",
      model,
      initialStatus: "ENABLED",
      maxOutputTokens: OPENROUTER_MAX_OUTPUT_TOKENS,
      timeoutMs: openrouter.timeoutMs,
    });
  return [
    config(OPENROUTER_DEFAULT_CONFIG_KEY, openrouter.defaultModel),
    ...(openrouter.fallbackModel ? [config(OPENROUTER_FALLBACK_CONFIG_KEY, openrouter.fallbackModel)] : []),
  ];
}

/**
 * The AI definitions of production (007 research C12.7, 008 research G3): the Curriculum Agent,
 * registered DISABLED until the admin enables it after the eval (FR-051), its task routed to the
 * OpenRouter configs, and the provider only with its key. Without it the app starts, and requests
 * answer `AI_MODEL_UNAVAILABLE`. Tests replace this value with `apps/api/test/fixtures/ai`.
 */
export function productionAiDefinitions(config: AppConfig): AiDefinitions {
  const { apiKey, baseUrl } = config.ai.anthropic;
  const modelConfigs = openRouterModelConfigs(config.ai.openrouter);
  const fallback = modelConfigs.some((model) => model.key === OPENROUTER_FALLBACK_CONFIG_KEY);
  const curriculum = curriculumAiDefinitions();
  return {
    ...curriculum,
    modelConfigs,
    tasks: curriculum.tasks.map((task) =>
      task.key === CURRICULUM_EXTRACTION_TASK.key && fallback ? { ...task, fallbackModelConfigKey: OPENROUTER_FALLBACK_CONFIG_KEY } : task,
    ),
    providers: apiKey ? [new AnthropicProvider({ apiKey, baseUrl })] : [],
  };
}
