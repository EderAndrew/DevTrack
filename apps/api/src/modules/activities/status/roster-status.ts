import type { RosterStatus } from "@repo/contracts";
import { type ActivityFacts, isPastDeadline } from "./facts";

/**
 * Each student's situation in the teacher's roster (contracts/student-status.md): a student who can
 * no longer submit (deadline passed under REJECT, or activity CLOSED) and didn't is MISSED.
 */
export function deriveRosterStatus(facts: ActivityFacts): RosterStatus {
  if (facts.submission) return facts.submission.late ? "SUBMITTED_LATE" : "SUBMITTED";
  if (facts.activityStatus === "CLOSED" || (isPastDeadline(facts) && facts.latePolicy === "REJECT")) return "MISSED";
  if (facts.attempt?.status === "IN_PROGRESS") return "IN_PROGRESS";
  return "NOT_STARTED";
}
