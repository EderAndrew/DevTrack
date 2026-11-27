import type { ActivityType, LatePolicy, PublicationPhase } from "@repo/contracts";

/**
 * The period of an ASSIGNMENT or EXAM (032 research AP5, AP6): `publishAt` → `deadline`, compared with
 * the injected server clock. Pure, so the service, the attendance and the tests share one rule
 * (constitution VII); the database backs only the clock-free part (CHECKs and the trigger "an exam's
 * end only moves later once a student started").
 */

const MINUTE_MS = 60_000;

/** FR-002: the end comes after the start; an exam's period holds at least its duration. */
export function validPeriod(period: { type: ActivityType; publishAt: Date; deadline: Date; durationMinutes: number | null }): boolean {
  if (period.deadline.getTime() <= period.publishAt.getTime()) return false;
  if (period.type !== "EXAM") return true;
  return period.deadline.getTime() - period.publishAt.getTime() >= (period.durationMinutes ?? 0) * MINUTE_MS;
}

export type EndChange = "ok" | "INVALID_SCHEDULE" | "EXAM_END_CANNOT_MOVE_EARLIER" | "ACTIVITY_PERIOD_ENDED";

/**
 * FR-012: a work's end changes freely while the activity is ACTIVE; a scheduled exam's too; a published
 * exam's only moves later, and only while its current end has not passed (at the end's instant it still
 * has not). `INVALID_SCHEDULE` is `validPeriod`'s, checked on the resulting pair.
 */
export function canChangeEnd(change: {
  type: ActivityType;
  phase: PublicationPhase;
  currentEnd: Date;
  newEnd: Date;
  now: Date;
}): EndChange {
  if (change.type !== "EXAM" || change.phase === "SCHEDULED") return "ok";
  if (change.now.getTime() > change.currentEnd.getTime()) return "ACTIVITY_PERIOD_ENDED";
  if (change.newEnd.getTime() < change.currentEnd.getTime()) return "EXAM_END_CANNOT_MOVE_EARLIER";
  return "ok";
}

/**
 * FR-014: a presence mark releases the activity only up to the period's end, inclusive; after it only
 * a legacy work that still accepts late submissions (`ACCEPT_MARKED`, AP2) takes marks. An activity
 * with no period (EXERCISE) never refuses on time.
 */
export function acceptsAttendanceMark(facts: { type: ActivityType; latePolicy: LatePolicy | null; deadline: Date | null; now: Date }): boolean {
  if (facts.deadline === null) return true;
  if (facts.type === "ASSIGNMENT" && facts.latePolicy === "ACCEPT_MARKED") return true;
  return facts.now.getTime() <= facts.deadline.getTime();
}
