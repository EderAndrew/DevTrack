import type { ActivityStatus, ExamEndReason, ExamStatusOfStudent } from "@repo/contracts";

/**
 * A student's situation in an exam (018 data-model "Derived", research T12), derived on every read
 * with the server's `now`; never stored. The order of the checks is the table's.
 */

/** What the monitor reads of one student. */
export interface ExamStudentFacts {
  /** The teacher's presence mark, null when not marked. */
  markedAt: Date | null;
  /** The attempt's start, null without an attempt. */
  startedAt: Date | null;
  /** The submission's end reason, null without a submission. */
  endReason: ExamEndReason | null;
  holdOpen: boolean;
  pauseOpen: boolean;
}

const BY_END_REASON: Record<ExamEndReason, ExamStatusOfStudent> = {
  STUDENT_SUBMITTED: "SUBMITTED",
  TIME_EXPIRED: "TIME_EXPIRED",
  ACTIVITY_CLOSED: "ACTIVITY_CLOSED",
  ENDED_BY_WARNINGS: "ENDED_BY_WARNINGS",
  CANCELLED: "CANCELLED",
};

export function examStatusOf(facts: ExamStudentFacts, startDeadline: Date, now: Date): ExamStatusOfStudent {
  if (facts.markedAt === null) return "NOT_MARKED";
  if (facts.startedAt === null) return now <= startDeadline ? "PRESENT" : "START_CLOSED";
  if (facts.holdOpen) return "AWAITING_DECISION";
  if (facts.endReason !== null) return BY_END_REASON[facts.endReason];
  if (facts.pauseOpen) return "PAUSED";
  return "ANSWERING";
}

/** "Devolver prova" (FR-022): the hold is open, the attempt still has time and the activity is ACTIVE. */
export function canReturn(hold: { resolution: string | null }, endsAt: Date, activityStatus: ActivityStatus, now: Date): boolean {
  return hold.resolution === null && activityStatus === "ACTIVE" && now < endsAt;
}
