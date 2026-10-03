import type { ActivityStatus, AttemptStatus, LatePolicy } from "@repo/contracts";

/**
 * What the situation of a student in an activity is derived from (012 and 013
 * contracts/student-status.md), by type. Nothing derived from these facts is stored: every read
 * derives it again with the server clock (constitution III, research P4, P11).
 */
interface CommonFacts {
  activityStatus: ActivityStatus;
  /** The class is ACTIVE (a class not ACTIVE is read-only for its students). */
  classActive: boolean;
  /** The server clock. */
  now: Date;
}

/** An ASSIGNMENT (012): one attempt, a deadline, a submission and a released result. */
export interface AssignmentFacts extends CommonFacts {
  type: "ASSIGNMENT";
  deadline: Date;
  latePolicy: LatePolicy;
  attempt: { status: AttemptStatus } | null;
  submission: { late: boolean; gradingComplete: boolean } | null;
  /** The teacher released the activity's result (research P14). */
  released: boolean;
}

/** An EXERCISE (013 research K3, K9): numbered practice attempts, no deadline, no submission. */
export interface ExerciseFacts extends CommonFacts {
  type: "EXERCISE";
  /** The student's latest attempt; every earlier one is concluded (numbering trigger). */
  latestAttempt: { number: number; status: AttemptStatus } | null;
  /** An answer of attempt 1 waits for the teacher's mark (`PENDING_TEACHER`). */
  awaitingCorrection: boolean;
}

export type ActivityFacts = AssignmentFacts | ExerciseFacts;

/**
 * The deadline and late policy of an ASSIGNMENT row: NOT NULL for that type by the CHECK of
 * `class_activities` (013 K1), so a null here is a broken invariant, not a user error.
 */
export function assignmentSchedule(row: { deadline: Date | null; latePolicy: LatePolicy | null }): { deadline: Date; latePolicy: LatePolicy } {
  if (row.deadline === null || row.latePolicy === null) throw new Error("an ASSIGNMENT has a deadline and a late policy (CHECK)");
  return { deadline: row.deadline, latePolicy: row.latePolicy };
}

/** Strictly after the deadline: at the deadline's instant the activity is still on time. */
export const isPastDeadline = (facts: Pick<AssignmentFacts, "deadline" | "now">): boolean => facts.now.getTime() > facts.deadline.getTime();

/** At least one attempt concluded: the latest one, or any before it (013 K3). */
export const hasConcluded = (facts: Pick<ExerciseFacts, "latestAttempt">): boolean =>
  facts.latestAttempt !== null && (facts.latestAttempt.status === "SUBMITTED" || facts.latestAttempt.number > 1);
