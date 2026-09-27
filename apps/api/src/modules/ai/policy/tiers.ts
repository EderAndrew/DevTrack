import { compareTiers, type ModelTier, nextTier } from "../definitions/model-families";

/**
 * Tier rules of a task policy (009 research H5, H9). Pure. The ceiling defaults to the preferred
 * tier, so a task escalates only when its policy names a higher `maxTier`.
 */
export const maxTierOf = (policy: { preferredTier: ModelTier; maxTier?: ModelTier }): ModelTier => policy.maxTier ?? policy.preferredTier;

/** The tier an escalation from `current` would go to, or null when the policy doesn't allow one. */
export function escalationTierOf(
  policy: { preferredTier: ModelTier; maxTier?: ModelTier; escalation: "NONE" | "ON_OUTPUT_INVALID" },
  current: ModelTier,
): ModelTier | null {
  if (policy.escalation !== "ON_OUTPUT_INVALID") return null;
  const next = nextTier(current);
  return next && compareTiers(next, maxTierOf(policy)) <= 0 ? next : null;
}
