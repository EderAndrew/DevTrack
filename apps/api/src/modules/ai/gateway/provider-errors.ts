import type { AiErrorCode } from "@repo/contracts";
import type { GatewayLeg } from "./model-gateway";

/**
 * Categories a provider maps its own failures to (research A12). A provider throws
 * `ProviderError`, never a raw SDK error, and never puts its credential or response in it.
 */
export type ProviderErrorCategory = "UNAVAILABLE" | "RATE_LIMITED" | "TIMEOUT" | "INVALID_REQUEST" | "AUTH" | "UNKNOWN";

export class ProviderError extends Error {
  constructor(readonly category: ProviderErrorCategory) {
    super(`provider error: ${category}`);
    this.name = "ProviderError";
  }
}

/** Normalized code of each provider failure (006/FR-050). */
export const PROVIDER_ERROR_CODES: Readonly<Record<ProviderErrorCategory, AiErrorCode>> = {
  UNAVAILABLE: "AI_PROVIDER_ERROR",
  RATE_LIMITED: "AI_RATE_LIMITED",
  TIMEOUT: "AI_TIMEOUT",
  INVALID_REQUEST: "AI_PROVIDER_ERROR",
  AUTH: "AI_MODEL_UNAVAILABLE",
  UNKNOWN: "AI_PROVIDER_ERROR",
};

/**
 * A controlled failure of an AI step, carrying only the normalized code and counters — never a
 * provider message, prompt or output. The runner turns it into the execution's final status.
 */
export class AiFailure extends Error {
  constructor(
    readonly code: AiErrorCode,
    readonly attempts = 0,
    readonly durationMs = 0,
    /** The configs the gateway tried, for the runner to record (008 research G6). */
    readonly legs: readonly GatewayLeg[] = [],
  ) {
    super(code);
    this.name = "AiFailure";
  }
}
