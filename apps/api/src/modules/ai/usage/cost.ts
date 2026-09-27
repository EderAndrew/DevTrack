import type { ModelPrice, ModelUsage } from "../definitions/types";

export type { ModelPrice };

/** Decimal as integer millionths, so prices × tokens stay exact. */
const MICRO = 1_000_000n;
const SCALE = 6;

export function toMicros(decimal: string): bigint {
  const [whole = "0", fraction = ""] = decimal.split(".");
  return BigInt(whole) * MICRO + BigInt(fraction.padEnd(SCALE, "0").slice(0, SCALE));
}

function fromMicros(micros: bigint): string {
  const whole = micros / MICRO;
  const fraction = (micros % MICRO).toString().padStart(SCALE, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Estimated cost of a call (006 FR-059, research A16): (input × input price + output × output
 * price) / 1 000 000, with prices per million tokens. Empty without reported tokens or without a
 * price — never an estimate of tokens. Rounded down to 6 decimal places.
 */
export function estimateCost(usage: ModelUsage | null, price: ModelPrice | null): { amount: string; currency: string } | null {
  if (!usage || !price || usage.inputTokens === null || usage.outputTokens === null) return null;
  const total = BigInt(usage.inputTokens) * toMicros(price.inputPerMTok) + BigInt(usage.outputTokens) * toMicros(price.outputPerMTok);
  return { amount: fromMicros(total / MICRO), currency: price.currency };
}

/**
 * The cost recorded for a call (008 research G17): the amount the provider reported
 * (`PROVIDER`), else the estimate by the config's price (`PRICE`), else none.
 */
export function callCost(
  usage: ModelUsage | null,
  price: ModelPrice | null,
): { amount: string; currency: string; source: "PROVIDER" | "PRICE" } | null {
  if (usage?.cost) return { ...usage.cost, source: "PROVIDER" };
  const estimated = estimateCost(usage, price);
  return estimated ? { ...estimated, source: "PRICE" } : null;
}
