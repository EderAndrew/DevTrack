/**
 * Splits `total` into `k` integer parts (011 research W4): every part gets `floor(total / k)` and
 * the first `total mod k` one more, so the parts sum to `total`, differ by at most 1 and never
 * increase. Pure and deterministic; `k = 0` gives no part.
 */
export function splitEvenly(total: number, k: number): number[] {
  if (k <= 0) return [];
  const base = Math.floor(total / k);
  const rest = total % k;
  return Array.from({ length: k }, (_, index) => base + (index < rest ? 1 : 0));
}
