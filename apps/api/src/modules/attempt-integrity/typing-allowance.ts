/** The limits of `contracts/configuration.md` (015 research F7). */
export interface TypingAllowanceLimits {
  /** Characters an answer may grow in one save regardless of time. */
  typingBurstChars: number;
  /** Extra growth allowed per second since the answer's last save. */
  typingCharsPerSecond: number;
}

/** One text answer about to be saved: its stored text and the time it was saved (or the attempt started). */
export interface TypingChange {
  before: string;
  after: string;
  /** The answer's last `saved_at`, or the attempt's `started_at` for its first save. */
  since: Date;
  now: Date;
}

/**
 * How much an answer may grow now (015/FR-013c, research F7): the burst plus the typing rate times
 * the whole seconds elapsed since `since` (none before it). Integer arithmetic only.
 */
export function allowedGrowth(since: Date, now: Date, limits: TypingAllowanceLimits): number {
  const elapsedMs = Math.max(0, now.getTime() - since.getTime());
  return limits.typingBurstChars + limits.typingCharsPerSecond * Math.floor(elapsedMs / 1_000);
}

/**
 * Whether the change looks typed (015/FR-013c): shrinking or keeping the size is always allowed;
 * growing is allowed up to `allowedGrowth`, inclusive. A paste right after a save grows past it.
 */
export function withinTypingAllowance(change: TypingChange, limits: TypingAllowanceLimits): boolean {
  const growth = change.after.length - change.before.length;
  return growth <= 0 || growth <= allowedGrowth(change.since, change.now, limits);
}
