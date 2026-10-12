/**
 * An exam's time (018 research T4), derived on every read from the stored facts and the server's
 * `now`; nothing here is stored. Each student gets the whole duration from their own start; only the
 * teacher's close or cancellation brings the end forward.
 */

/** A save or submit already on the network when the timer hits zero still lands (T4). */
export const EXAM_END_GRACE_MS = 2000;

const MINUTE_MS = 60_000;

/** What the time rules read of an EXAM activity. */
export interface ExamTiming {
  publishAt: Date;
  durationMinutes: number;
  startWindowMinutes: number;
  closedAt: Date | null;
  cancelledAt: Date | null;
}

const plusMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * MINUTE_MS);

/** The last moment a student may start: the publication plus the start window. */
export function startDeadline(timing: ExamTiming): Date {
  return plusMinutes(timing.publishAt, timing.startWindowMinutes);
}

/** A start is accepted from the publication up to the start deadline, inclusive (`409 EXAM_START_CLOSED` after). */
export function canStart(timing: ExamTiming, now: Date): boolean {
  return timing.publishAt <= now && now <= startDeadline(timing);
}

/** The attempt's end: its start plus the duration, capped by the activity's close or cancellation. */
export function endsAt(timing: ExamTiming, startedAt: Date): Date {
  const ends = [plusMinutes(startedAt, timing.durationMinutes), timing.closedAt, timing.cancelledAt].filter((date): date is Date => date !== null);
  return new Date(Math.min(...ends.map((date) => date.getTime())));
}

/** Shown to the teacher: the latest end of a student who starts at the start deadline. Nothing closes by itself. */
export function closesAt(timing: ExamTiming): Date {
  return plusMinutes(startDeadline(timing), timing.durationMinutes);
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

/** Whether the end was the activity's close or cancellation rather than the duration (`ACTIVITY_CLOSED`). */
export function endedByActivity(timing: ExamTiming, startedAt: Date): boolean {
  return endsAt(timing, startedAt).getTime() < plusMinutes(startedAt, timing.durationMinutes).getTime();
}
