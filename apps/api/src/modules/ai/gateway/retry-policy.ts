import type { ProviderErrorCategory } from "./provider-errors";

/** Only these are retried (006/FR-049); permanent failures never are. */
const TRANSIENT: ReadonlySet<ProviderErrorCategory> = new Set(["UNAVAILABLE", "RATE_LIMITED", "TIMEOUT"]);

export const isTransient = (category: ProviderErrorCategory): boolean => TRANSIENT.has(category);

/** Wait before retry number `retry` (0-based): 500 ms · 2^retry plus up to 20% jitter. */
export function backoffMs(retry: number, random: () => number = Math.random): number {
  const base = 500 * 2 ** retry;
  return Math.round(base + base * 0.2 * random());
}
