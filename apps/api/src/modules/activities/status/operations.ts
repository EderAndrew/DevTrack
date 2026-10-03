import { type ActivityFacts, type AssignmentFacts, type ExerciseFacts, hasConcluded, isPastDeadline } from "./facts";

/** START, SAVE and SUBMIT (012); RETRY ("Refazer") and COMPLETE ("Concluir exercícios") only for EXERCISE (013). */
export type StudentOperation = "START" | "SAVE" | "SUBMIT" | "RETRY" | "COMPLETE";

/** Why a student operation is refused (409 codes of contracts/http-api.md). */
export type OperationRefusal =
  | "CLASS_NOT_ACTIVE"
  | "ACTIVITY_CLOSED"
  | "DEADLINE_PASSED"
  | "NOT_STARTED"
  | "ATTEMPT_ALREADY_SUBMITTED"
  | "ATTEMPT_NOT_COMPLETED"
  | "NOT_LATEST_ATTEMPT"
  | "INVALID_STATE_TRANSITION";

/** What happens to a student operation: allowed, an idempotent repeat, or refused with a code. */
export type OperationOutcome = { kind: "ALLOWED" } | { kind: "REPEAT" } | { kind: "REFUSED"; code: OperationRefusal };

const allowed: OperationOutcome = { kind: "ALLOWED" };
const repeat: OperationOutcome = { kind: "REPEAT" };
const refused = (code: OperationRefusal): OperationOutcome => ({ kind: "REFUSED", code });

/**
 * The operation rules of contracts/student-status.md (012/FR-021, FR-024a; 013 research K4, K5).
 * Out-of-context cases (enrollment not ACTIVE, activity cancelled or scheduled) never get here: they
 * are 404 before. `target` is the attempt an EXERCISE operation names: RETRY's `afterNumber`,
 * COMPLETE's `number`.
 */
export function decideOperation(operation: StudentOperation, facts: ActivityFacts, target?: number): OperationOutcome {
  return facts.type === "EXERCISE" ? decideExercise(operation, facts, target) : decideAssignment(operation, facts);
}

/**
 * ASSIGNMENT (012): a submitted attempt answers a repeated start or submit with the same attempt and
 * submission (idempotent, research P7, P9) and refuses a save. Otherwise: a class not ACTIVE, a
 * CLOSED activity and a deadline passed under REJECT refuse everything; a save or submit needs a
 * started attempt. RETRY and COMPLETE don't exist for it.
 */
function decideAssignment(operation: StudentOperation, facts: AssignmentFacts): OperationOutcome {
  if (operation === "RETRY" || operation === "COMPLETE") return refused("INVALID_STATE_TRANSITION");
  if (facts.submission) return operation === "SAVE" ? refused("ATTEMPT_ALREADY_SUBMITTED") : repeat;
  if (!facts.classActive) return refused("CLASS_NOT_ACTIVE");
  if (facts.activityStatus === "CLOSED") return refused("ACTIVITY_CLOSED");
  if (isPastDeadline(facts) && facts.latePolicy === "REJECT") return refused("DEADLINE_PASSED");
  if (operation === "START") return facts.attempt ? repeat : allowed;
  if (!facts.attempt) return refused("NOT_STARTED");
  return allowed;
}

/**
 * EXERCISE (013): repeats first — completing an attempt already concluded returns it, and starting
 * when an attempt exists returns it —, then a class not ACTIVE or a CLOSED activity refuses
 * everything (no deadline). START creates attempt 1; SAVE and COMPLETE work on the open attempt;
 * RETRY creates the next attempt only after the latest one, named by `afterNumber`, is concluded,
 * and repeats when that next attempt is the one still open (research K4).
 */
function decideExercise(operation: StudentOperation, facts: ExerciseFacts, target?: number): OperationOutcome {
  if (operation === "SUBMIT") return refused("INVALID_STATE_TRANSITION");
  const latest = facts.latestAttempt;
  if (operation === "COMPLETE" && latest && target !== undefined && concluded(latest, target)) return repeat;
  if (operation === "START" && hasConcluded(facts)) return repeat;
  if (!facts.classActive) return refused("CLASS_NOT_ACTIVE");
  if (facts.activityStatus === "CLOSED") return refused("ACTIVITY_CLOSED");
  if (operation === "START") return latest ? repeat : allowed;
  if (!latest) return refused("NOT_STARTED");
  const open = latest.status === "IN_PROGRESS";
  if (operation === "SAVE") return open ? allowed : refused("ATTEMPT_ALREADY_SUBMITTED");
  if (operation === "COMPLETE") return open && target === latest.number ? allowed : refused("NOT_STARTED");
  // RETRY
  if (open) return target === latest.number - 1 ? repeat : refused("ATTEMPT_NOT_COMPLETED");
  return target === latest.number ? allowed : refused("NOT_LATEST_ATTEMPT");
}

/** Attempt `number` exists and is concluded: an earlier one, or the latest when it is SUBMITTED. */
const concluded = (latest: { number: number; status: string }, number: number): boolean =>
  number >= 1 && (number < latest.number || (number === latest.number && latest.status === "SUBMITTED"));

/**
 * Start, save and submit (ASSIGNMENT) or start, save and complete (EXERCISE) allowed now
 * (`canAnswer` of the student's views). An EXERCISE stays answerable after a conclusion ("Refazer").
 */
export function canAnswer(facts: ActivityFacts): boolean {
  if (facts.type === "EXERCISE") return facts.classActive && facts.activityStatus === "ACTIVE";
  return facts.submission === null && decideOperation("START", facts).kind !== "REFUSED";
}

/** A submission made now would be late (research P10). */
export const wouldBeLate = (facts: Pick<AssignmentFacts, "deadline" | "now">): boolean => isPastDeadline(facts);

/**
 * The teacher may accept the saved attempt as a late submission (FR-006b) only when the student can
 * no longer submit: the deadline passed under REJECT, or the activity was closed. ASSIGNMENT only.
 */
export function acceptanceRefusal(facts: AssignmentFacts): "NOT_STARTED" | "STUDENT_CAN_STILL_SUBMIT" | null {
  if (facts.submission) return null;
  if (!facts.attempt) return "NOT_STARTED";
  const studentBlocked = facts.activityStatus === "CLOSED" || (isPastDeadline(facts) && facts.latePolicy === "REJECT");
  return studentBlocked ? null : "STUDENT_CAN_STILL_SUBMIT";
}
