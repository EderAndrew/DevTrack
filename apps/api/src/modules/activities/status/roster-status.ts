import type { RosterStatus } from "@repo/contracts";
import { type ActivityFacts, hasConcluded, isPastDeadline } from "./facts";

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
 * ("Ausente"), whatever the deadline or the close; never MISSED, never graded.
 */
export function deriveRosterStatus(facts: ActivityFacts, presence: RosterPresence = "NOT_REQUIRED"): RosterStatus {
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
