import type { ExamEndReason, RosterStatus } from "@repo/contracts";
import { type ActivityFacts, type ExamFacts, hasConcluded, isPastDeadline, isStartClosed } from "./facts";

/**
 * The student's presence in the activity (016 research M9): `NOT_REQUIRED` for an `ALL_ENROLLED`
 * activity, which takes no attendance.
 */
export type RosterPresence = "MARKED" | "NOT_MARKED" | "NOT_REQUIRED";

/**
 * Each student's situation in the teacher's roster (contracts/student-status.md). ASSIGNMENT: a
 * student who can no longer submit (deadline passed under REJECT, or activity CLOSED) and didn't is
 * MISSED. EXERCISE (013): attempt 1 concluded is COMPLETED ("Concluiu"); there is no MISSED.
 * 016/FR-019: a student of a `PRESENT_ONLY` work never marked present, with no attempt, is ABSENT
 * ("Ausente"), whatever the deadline or the close; never MISSED, never graded. EXAM: see `examRosterStatus`.
 */
export function deriveRosterStatus(facts: ActivityFacts, presence: RosterPresence = "NOT_REQUIRED"): RosterStatus {
  if (facts.type === "EXAM") return examRosterStatus(facts, presence);
  if (facts.type === "EXERCISE") {
    if (hasConcluded(facts)) return "COMPLETED";
    return facts.latestAttempt?.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED";
  }
  if (presence === "NOT_MARKED" && !facts.attempt && !facts.submission) return "ABSENT";
  if (facts.submission) return facts.submission.late ? "SUBMITTED_LATE" : "SUBMITTED";
  if (facts.activityStatus === "CLOSED" || (isPastDeadline(facts) && facts.latePolicy === "REJECT")) return "MISSED";
  if (facts.attempt?.status === "IN_PROGRESS") return "IN_PROGRESS";
  return "NOT_STARTED";
}

/** How the teacher reads an ended exam attempt (018 contracts/web-ui.md): the close counts as the time running out. */
const EXAM_ENDED: Record<ExamEndReason, RosterStatus> = {
  STUDENT_SUBMITTED: "SUBMITTED",
  TIME_EXPIRED: "TIME_EXPIRED",
  ACTIVITY_CLOSED: "TIME_EXPIRED",
  ENDED_BY_WARNINGS: "ENDED_BY_WARNINGS",
  CANCELLED: "CANCELLED",
};

/**
 * EXAM (018/FR-009, FR-011, FR-018): ABSENT as a work when not marked; a submission by its end reason;
 * an open attempt AWAITING_DECISION while on hold, IN_PROGRESS otherwise; present without an attempt,
 * NOT_STARTED until the start deadline and START_CLOSED after it (or after a close). Never MISSED or late.
 */
function examRosterStatus(facts: ExamFacts, presence: RosterPresence): RosterStatus {
  if (presence === "NOT_MARKED" && !facts.attempt && !facts.submission) return "ABSENT";
  if (facts.submission) return EXAM_ENDED[facts.submission.endReason ?? "STUDENT_SUBMITTED"];
  if (facts.attempt?.status === "IN_PROGRESS") return facts.onHold ? "AWAITING_DECISION" : "IN_PROGRESS";
  if (facts.activityStatus === "CLOSED" || isStartClosed(facts)) return "START_CLOSED";
  return "NOT_STARTED";
}
