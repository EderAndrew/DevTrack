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
 * release; else the earlier of the teacher's acceptance and the activity's close or cancellation,
 * since either one lifts the paused-write refusal; else still open, counted up to `now`.
 */
export function pauseTime(pause: PauseFacts, context: PauseEndContext, now: Date): PauseTime {
  let endedAt: Date | null = null;
  let endedBy: PauseEndKind | null = null;
  if (pause.releasedAt) {
    endedAt = pause.releasedAt;
    endedBy = "RELEASE";
  } else if (context.acceptedAt && (!context.activityEndedAt || context.acceptedAt <= context.activityEndedAt)) {
    endedAt = context.acceptedAt;
    endedBy = "ACCEPTED";
  } else if (context.activityEndedAt) {
    endedAt = context.activityEndedAt;
    endedBy = "ACTIVITY_CLOSED";
  }
  return { endedAt, endedBy, seconds: secondsBetween(pause.startedAt, endedAt ?? now) };
}

/** Whole seconds an attempt spent out of the room: the sum of its pauses (016 FR-019, FR-021). */
export function secondsAway(pauses: readonly PauseFacts[], context: PauseEndContext, now: Date): number {
  return pauses.reduce((total, pause) => total + pauseTime(pause, context, now).seconds, 0);
}
