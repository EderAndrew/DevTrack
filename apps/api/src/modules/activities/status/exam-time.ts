/**
 * An exam's time (018 research T4, 032 research AP3), derived on every read from the stored facts and
 * the server's `now`; nothing here is stored. The exam is applied for a period (`publishAt` →
 * `deadline`): a present student starts any time in it, and each attempt ends at the earliest of their
 * start + the duration, the period's end, and the teacher's close or cancellation.
 */

/** A save or submit already on the network when the timer hits zero still lands (T4). */
export const EXAM_END_GRACE_MS = 2000;

const MINUTE_MS = 60_000;

/** What the time rules read of an EXAM activity. */
export interface ExamTiming {
  publishAt: Date;
  durationMinutes: number;
  /** The period's end (032). */
  deadline: Date;
  closedAt: Date | null;
  cancelledAt: Date | null;
}

const plusMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * MINUTE_MS);

/** The last moment a student may start: the period's end (032; no start window since then). */
export function startDeadline(timing: Pick<ExamTiming, "deadline">): Date {
  return timing.deadline;
}

/** A start is accepted from the publication up to the start deadline, inclusive (`409 EXAM_START_CLOSED` after). */
export function canStart(timing: ExamTiming, now: Date): boolean {
  return timing.publishAt <= now && now <= startDeadline(timing);
}

/** The attempt's end: its start plus the duration, capped by the period's end and the activity's close or cancellation. */
export function endsAt(timing: ExamTiming, startedAt: Date): Date {
  const ends = [plusMinutes(startedAt, timing.durationMinutes), timing.deadline, timing.closedAt, timing.cancelledAt].filter(
    (date): date is Date => date !== null,
  );
  return new Date(Math.min(...ends.map((date) => date.getTime())));
}

/** Shown to the teacher: the period's end, the latest any attempt can end (032). Nothing closes by itself. */
export function closesAt(timing: Pick<ExamTiming, "deadline">): Date {
  return timing.deadline;
}

/** Milliseconds left, never negative. */
export function remainingMs(end: Date, now: Date): number {
  return Math.max(0, end.getTime() - now.getTime());
}

/** Saves and the submit are accepted until `endsAt + EXAM_END_GRACE_MS` (`409 EXAM_TIME_OVER` after). */
export function acceptsWrite(now: Date, end: Date): boolean {
  return now.getTime() < end.getTime() + EXAM_END_GRACE_MS;
}

/** Integrity events never get the grace: none is accepted from `endsAt` on. */
export function acceptsEvent(now: Date, end: Date): boolean {
  return now < end;
}

/**
 * Whether the end was the activity's close or cancellation (`ACTIVITY_CLOSED`) rather than the time: the
 * duration or the period's end are both `TIME_EXPIRED` (032 AP3).
 */
export function endedByActivity(timing: ExamTiming, startedAt: Date): boolean {
  return endsAt(timing, startedAt).getTime() < endsAt({ ...timing, closedAt: null, cancelledAt: null }, startedAt).getTime();
}
