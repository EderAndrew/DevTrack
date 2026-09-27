import type { ModelPrice } from "../definitions/types";
import { toMicros } from "../usage/cost";

/**
 * Estimated cost of a typical call of a task on a model (009 research H7, contracts/model-policy.md):
 * `inputTokens × input price + outputTokens × output price`, in millionths of the currency per
 * million tokens (exact, only for ordering). null without a price: such models come after the
 * priced ones.
 */
export function estimatedCallCost(typicalUsage: { inputTokens: number; outputTokens: number }, price: ModelPrice | null): bigint | null {
  if (!price) return null;
  return BigInt(typicalUsage.inputTokens) * toMicros(price.inputPerMTok) + BigInt(typicalUsage.outputTokens) * toMicros(price.outputPerMTok);
}
