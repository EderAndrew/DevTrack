const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Waits after each failed attempt (contracts/mail-delivery.md, "Esperas"): 1 min, 5 min, 15 min,
 * 1 h, 3 h, 6 h. The 7th failure is final (`FAILED`); the whole window is about 10 h 21 min.
 */
const RETRY_WAITS_MS = [1 * MINUTE_MS, 5 * MINUTE_MS, 15 * MINUTE_MS, 1 * HOUR_MS, 3 * HOUR_MS, 6 * HOUR_MS] as const;

export const MAX_DELIVERY_ATTEMPTS = RETRY_WAITS_MS.length + 1;

/** A new delivery is due this long after it is scheduled: time for the first attempt to record its result. */
export const FIRST_ATTEMPT_GRACE_MS = MINUTE_MS;

/** When to try again after `failures` failed attempts; `null` once they are exhausted. */
export function nextAttemptAfter(failures: number, now: Date): Date | null {
  if (!Number.isInteger(failures) || failures < 1) throw new RangeError(`failures must be ≥ 1, got ${failures}`);
  const wait = RETRY_WAITS_MS[failures - 1];
  return wait === undefined ? null : new Date(now.getTime() + wait);
}

/**
 * While an attempt is in flight its delivery stays `PENDING`, already due at the wait that
 * follows it: if the process dies before recording the result, the worker picks it up then and
 * the lost attempt counts as a failure (mail-delivery.md, step 4). The last attempt reuses the
 * longest wait, after which the worker marks it `FAILED` without sending.
 */
export function inFlightDeadline(attempt: number, now: Date): Date {
  return nextAttemptAfter(Math.min(attempt, RETRY_WAITS_MS.length), now)!;
}
