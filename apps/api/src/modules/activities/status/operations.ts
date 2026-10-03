import { type ActivityFacts, isPastDeadline } from "./facts";

export type StudentOperation = "START" | "SAVE" | "SUBMIT";

/** Why a student operation is refused (409 codes of contracts/http-api.md). */
export type OperationRefusal =
  | "CLASS_NOT_ACTIVE"
  | "ACTIVITY_CLOSED"
  | "DEADLINE_PASSED"
  | "NOT_STARTED"
  | "ATTEMPT_ALREADY_SUBMITTED";

/** What happens to a student operation: allowed, an idempotent repeat, or refused with a code. */
export type OperationOutcome = { kind: "ALLOWED" } | { kind: "REPEAT" } | { kind: "REFUSED"; code: OperationRefusal };

const allowed: OperationOutcome = { kind: "ALLOWED" };
const refused = (code: OperationRefusal): OperationOutcome => ({ kind: "REFUSED", code });

/**
 * The operation rules of contracts/student-status.md (FR-021, FR-024a). Out-of-context cases
 * (enrollment not ACTIVE, activity cancelled or scheduled) never get here: they are 404 before.
 *
 * A submitted attempt answers a repeated start or submit with the same attempt and submission
 * (idempotent, research P7, P9) and refuses a save. Otherwise: a class not ACTIVE, a CLOSED activity
 * and a deadline passed under REJECT refuse everything; a save or submit needs a started attempt.
 */
export function decideOperation(operation: StudentOperation, facts: ActivityFacts): OperationOutcome {
  if (facts.submission) return operation === "SAVE" ? refused("ATTEMPT_ALREADY_SUBMITTED") : { kind: "REPEAT" };
  if (!facts.classActive) return refused("CLASS_NOT_ACTIVE");
  if (facts.activityStatus === "CLOSED") return refused("ACTIVITY_CLOSED");
  if (isPastDeadline(facts) && facts.latePolicy === "REJECT") return refused("DEADLINE_PASSED");
  if (operation === "START") return facts.attempt ? { kind: "REPEAT" } : allowed;
  if (!facts.attempt) return refused("NOT_STARTED");
  return allowed;
}

/** Start, save and submit allowed now (`canAnswer` of the student's views). */
export const canAnswer = (facts: ActivityFacts): boolean =>
  facts.submission === null && decideOperation("START", facts).kind !== "REFUSED";

/** A submission made now would be late (research P10). */
export const wouldBeLate = (facts: Pick<ActivityFacts, "deadline" | "now">): boolean => isPastDeadline(facts);

/**
 * The teacher may accept the saved attempt as a late submission (FR-006b) only when the student can
 * no longer submit: the deadline passed under REJECT, or the activity was closed.
 */
export function acceptanceRefusal(facts: ActivityFacts): "NOT_STARTED" | "STUDENT_CAN_STILL_SUBMIT" | null {
  if (facts.submission) return null;
  if (!facts.attempt) return "NOT_STARTED";
  const studentBlocked = facts.activityStatus === "CLOSED" || (isPastDeadline(facts) && facts.latePolicy === "REJECT");
  return studentBlocked ? null : "STUDENT_CAN_STILL_SUBMIT";
}
