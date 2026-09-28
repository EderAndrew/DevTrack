import type { ModelCapabilities } from "./model-families";
import { type CatalogModel, defineCatalogModel } from "./types";

/**
 * The model catalog of production (009 research H2, H12, contracts/catalog-and-quality-gate.md):
 * the only place with concrete model ids. Ids, context windows and reference prices from
 * OpenRouter's public model list on 2026-09-27 (USD per million tokens); refreshed here, never in
 * the spec. Nothing enters by itself (009 FR-004): a new model or version is a reviewed change to
 * this file.
 *
 * Every entry starts CANDIDATE and without approvals (009 FR-002, FR-017): an approval needs a
 * committed evaluation evidence file that records the model actually served, which the 007
 * `recorded.json` doesn't. Promotion to PRODUCTION happens with the release gate (quickstart §2).
 */

/** Ceiling of the output tokens of an OpenRouter model; each task sets its own below it. */
const MAX_OUTPUT_TOKENS = 32_000;

/** Ceiling of one call; `OPENROUTER_TIMEOUT_MS` lowers it in production. */
const TIMEOUT_MS = 120_000;

const GENERATION: ModelCapabilities = { structuredOutput: true, tools: true, vision: true, reasoning: true };

const openRouter = (entry: Omit<CatalogModel, "provider" | "initialStatus" | "maxOutputTokens" | "timeoutMs">): CatalogModel =>
  defineCatalogModel({ provider: "openrouter", initialStatus: "ENABLED", maxOutputTokens: MAX_OUTPUT_TOKENS, timeoutMs: TIMEOUT_MS, ...entry });

const usd = (inputPerMTok: string, outputPerMTok: string) => ({ inputPerMTok, outputPerMTok, currency: "USD" });

export const MODEL_CATALOG: readonly CatalogModel[] = [
  openRouter({
    key: "anthropic-basic",
    family: "anthropic",
    model: "anthropic/claude-haiku-4.5",
    tier: "BASIC",
    mode: "GENERATION",
    lifecycle: "CANDIDATE",
    price: usd("1", "5"),
    contextWindow: 200_000,
    capabilities: GENERATION,
  }),
  openRouter({
    key: "anthropic-standard",
    family: "anthropic",
    model: "anthropic/claude-sonnet-5",
    tier: "STANDARD",
    mode: "GENERATION",
    lifecycle: "CANDIDATE",
    price: usd("2", "10"),
    contextWindow: 1_000_000,
    capabilities: GENERATION,
  }),
  // The 008 default model; no recorded evaluation yet.
  openRouter({
    key: "anthropic-advanced",
    family: "anthropic",
    model: "anthropic/claude-opus-5",
    tier: "ADVANCED",
    mode: "GENERATION",
    lifecycle: "CANDIDATE",
    price: usd("5", "25"),
    contextWindow: 1_000_000,
    capabilities: GENERATION,
  }),
  openRouter({
    key: "openai-basic",
    family: "openai",
    model: "openai/gpt-6-luna",
    tier: "BASIC",
    mode: "GENERATION",
    // Promoted by the release gate (009 T030): the golden set met every threshold of the analysis.
    lifecycle: "PRODUCTION",
    price: usd("0.1", "0.5"),
    contextWindow: 1_050_000,
    capabilities: GENERATION,
    approvals: [
      {
        taskKey: "curriculum-extraction",
        metrics: { itemRecall: 1, schemaValidity: 1, unsupportedWithoutWarning: 0, inventedFields: 0, languageMatch: 1, injectionClean: 1 },
        evaluatedAt: "2026-09-28T13:15:55.778Z",
        evidence: "apps/api/test/fixtures/evaluations/curriculum-extraction/openai-basic.json",
      },
      // 010 T049: the generator's golden set met every threshold of `exercise-generation`.
      {
        taskKey: "exercise-generation",
        metrics: { schemaValidity: 1, configMatch: 1, duplicates: 0, topicCoverage: 0.9655, injectionClean: 1 },
        evaluatedAt: "2026-09-28T20:04:09.584Z",
        evidence: "apps/api/test/fixtures/evaluations/exercise-generation/openai-basic.json",
      },
    ],
  }),
  openRouter({
    key: "openai-standard",
    family: "openai",
    model: "openai/gpt-6-sol",
    tier: "STANDARD",
    mode: "GENERATION",
    lifecycle: "CANDIDATE",
    price: usd("2", "10"),
    contextWindow: 1_050_000,
    capabilities: GENERATION,
  }),
  openRouter({
    key: "openai-advanced",
    family: "openai",
    model: "openai/gpt-6-astra",
    tier: "ADVANCED",
    mode: "GENERATION",
    lifecycle: "CANDIDATE",
    price: usd("10", "50"),
    contextWindow: 1_050_000,
    capabilities: GENERATION,
  }),
  // Decision mode (009 FR-001a, contracts/decisions-provider.md): answers choice, score or
  // yes/no, never text. Not in OpenRouter's model list, so no reference price: its cost comes
  // from each response. 64k tokens per request.
  openRouter({
    key: "typesafe-decision-basic",
    family: "typesafe",
    model: "typesafe/jev-1.13",
    tier: "BASIC",
    mode: "DECISION",
    lifecycle: "CANDIDATE",
    contextWindow: 64_000,
    capabilities: { structuredOutput: false, tools: false, vision: false, reasoning: false },
  }),
];
