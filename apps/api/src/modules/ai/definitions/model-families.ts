/**
 * The vocabulary of the model policy (009 research H3–H5): families, capability tiers, modes,
 * lifecycle and capabilities. Pure data and helpers, no Nest nor Prisma.
 */

/**
 * The only model families production may use (009 FR-001). A family is the vendor prefix of an
 * OpenRouter model id (`anthropic/…`); adding one is an explicit, reviewed change here.
 */
export const PRODUCTION_MODEL_FAMILIES = ["openai", "anthropic", "typesafe"] as const;
export type ModelFamily = (typeof PRODUCTION_MODEL_FAMILIES)[number];

/** Capability tiers, from the cheapest to the most capable; independent of family (009 FR-005). */
export const MODEL_TIERS = ["BASIC", "STANDARD", "ADVANCED"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** `GENERATION` writes text and structured output; `DECISION` only answers choice, score or yes/no (009 FR-001a). */
export const MODEL_MODES = ["GENERATION", "DECISION"] as const;
export type ModelMode = (typeof MODEL_MODES)[number];

/**
 * Lifecycle of a catalog entry (009 FR-016). The spec's `DISABLED` is the 006 status of the model
 * config (the admin's kill switch), which wins over any lifecycle (research H4).
 */
export const MODEL_LIFECYCLES = ["CANDIDATE", "EVALUATING", "PRODUCTION", "DEPRECATED"] as const;
export type ModelLifecycle = (typeof MODEL_LIFECYCLES)[number];

/** What a model can do; a task requires a subset (009 FR-002, FR-006). */
export const MODEL_CAPABILITIES = ["structuredOutput", "tools", "vision", "reasoning"] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];
export type ModelCapabilities = Record<ModelCapability, boolean>;

/** Negative, zero or positive as `a` is below, equal to or above `b`. */
export const compareTiers = (a: ModelTier, b: ModelTier): number => MODEL_TIERS.indexOf(a) - MODEL_TIERS.indexOf(b);

/** The tier above `tier`, or null at the top (escalation, research H9). */
export const nextTier = (tier: ModelTier): ModelTier | null => MODEL_TIERS[MODEL_TIERS.indexOf(tier) + 1] ?? null;

export const isModelTier = (value: unknown): value is ModelTier => MODEL_TIERS.includes(value as ModelTier);
