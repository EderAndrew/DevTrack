import type { RosterStatus } from "@repo/contracts";
import { type ActivityFacts, hasConcluded, isPastDeadline } from "./facts";

/**
 * Each student's situation in the teacher's roster (contracts/student-status.md). ASSIGNMENT: a
 * student who can no longer submit (deadline passed under REJECT, or activity CLOSED) and didn't is
 * MISSED. EXERCISE (013): attempt 1 concluded is COMPLETED ("Concluiu"); there is no MISSED.
 */
export function deriveRosterStatus(facts: ActivityFacts): RosterStatus {
  if (facts.type === "EXERCISE") {
    if (hasConcluded(facts)) return "COMPLETED";
    return facts.latestAttempt?.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED";
  }
  if (facts.submission) return facts.submission.late ? "SUBMITTED_LATE" : "SUBMITTED";
  if (facts.activityStatus === "CLOSED" || (isPastDeadline(facts) && facts.latePolicy === "REJECT")) return "MISSED";
  if (facts.attempt?.status === "IN_PROGRESS") return "IN_PROGRESS";
  return "NOT_STARTED";
}
