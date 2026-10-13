import type { PauseEndKind } from "@repo/contracts";

/** A room exit as stored (016 M6): only its start and the teacher's release are written. */
export interface PauseFacts {
  startedAt: Date;
  releasedAt: Date | null;
}

/** What else ends a pause without a write (016 M7). */
export interface PauseEndContext {
  /** `submitted_at` of the attempt's submission accepted by the teacher (012 FR-006b), if any. */
  acceptedAt: Date | null;
  /** The activity's `closed_at` or `cancelled_at`, if it is no longer ACTIVE. */
  activityEndedAt: Date | null;
  /**
   * 018 (research T11): an EXAM attempt's `endsAt`. The time keeps running during a pause, so a pause
   * still open when it comes ends there (`TIME_EXPIRED`); absent for the other types.
   */
  examEndsAt?: Date | null;
}

export interface PauseTime {
  endedAt: Date | null;
  endedBy: PauseEndKind | null;
  /** Whole seconds away, up to `now` while open; never negative. */
  seconds: number;
}

const secondsBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));

/**
 * A pause's end and duration, derived on every read (016 data-model.md "Derived"): the teacher's
 * release; else the earliest of the teacher's acceptance, the activity's close or cancellation (either
 * one lifts the paused-write refusal) and, for an exam, its end once reached (018 research T11) — a
 * tie goes to that order; else still open, counted up to `now`.
 */
export function pauseTime(pause: PauseFacts, context: PauseEndContext, now: Date): PauseTime {
  if (pause.releasedAt) return { endedAt: pause.releasedAt, endedBy: "RELEASE", seconds: secondsBetween(pause.startedAt, pause.releasedAt) };
  const examEnded = context.examEndsAt && context.examEndsAt <= now ? context.examEndsAt : null;
  const ends: [PauseEndKind, Date | null][] = [
    ["ACCEPTED", context.acceptedAt],
    ["ACTIVITY_CLOSED", context.activityEndedAt],
    ["TIME_EXPIRED", examEnded],
  ];
  let endedAt: Date | null = null;
  let endedBy: PauseEndKind | null = null;
  for (const [kind, at] of ends) {
    if (at && (!endedAt || at < endedAt)) {
      endedAt = at;
      endedBy = kind;
    }
  }
  return { endedAt, endedBy, seconds: secondsBetween(pause.startedAt, endedAt ?? now) };
}

/**
 * 018: an exam attempt's end by its duration, for `examEndsAt` (exam-time.ts `endsAt` without the
 * close's cap, which `activityEndedAt` already carries); null for a work, which has no duration.
 */
export function examEndOf(startedAt: Date, durationMinutes: number | null): Date | null {
  return durationMinutes === null ? null : new Date(startedAt.getTime() + durationMinutes * 60_000);
}

/** Whole seconds an attempt spent out of the room: the sum of its pauses (016 FR-019, FR-021). */
export function secondsAway(pauses: readonly PauseFacts[], context: PauseEndContext, now: Date): number {
  return pauses.reduce((total, pause) => total + pauseTime(pause, context, now).seconds, 0);
}
