import type { ActivityStatus, AttemptStatus, ExamEndReason, LatePolicy } from "@repo/contracts";
import type { ExamTiming } from "./exam-time";

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

/**
 * An EXAM (018 research T3, T4): one attempt, like an ASSIGNMENT, but no deadline or late policy: a
 * start window from the publication, and the duration counted from each student's own start.
 */
export interface ExamFacts extends CommonFacts {
  type: "EXAM";
  /** The publication plus the start window: no new attempt after it (`EXAM_START_CLOSED`). */
  startDeadline: Date;
  attempt: { status: AttemptStatus } | null;
  /** `endReason` is set for every EXAM submission (trigger); null only where the reader doesn't need it. */
  submission: { endReason: ExamEndReason | null; gradingComplete: boolean } | null;
  released: boolean;
}

export type ActivityFacts = AssignmentFacts | ExerciseFacts | ExamFacts;

/**
 * The deadline and late policy of an ASSIGNMENT row: NOT NULL for that type by the CHECK of
 * `class_activities` (013 K1), so a null here is a broken invariant, not a user error.
 */
export function assignmentSchedule(row: { deadline: Date | null; latePolicy: LatePolicy | null }): { deadline: Date; latePolicy: LatePolicy } {
  if (row.deadline === null || row.latePolicy === null) throw new Error("an ASSIGNMENT has a deadline and a late policy (CHECK)");
  return { deadline: row.deadline, latePolicy: row.latePolicy };
}

/** The timing columns of an EXAM row: NOT NULL for that type by the CHECK of `class_activities` (018 T3). */
export function examTiming(row: {
  publishAt: Date;
  durationMinutes: number | null;
  startWindowMinutes: number | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
}): ExamTiming {
  if (row.durationMinutes === null || row.startWindowMinutes === null) throw new Error("an EXAM has a duration and a start window (CHECK)");
  return { publishAt: row.publishAt, durationMinutes: row.durationMinutes, startWindowMinutes: row.startWindowMinutes, closedAt: row.closedAt, cancelledAt: row.cancelledAt };
}

/** No new attempt from the start deadline on (strictly after it, as `exam-time.ts` `canStart`). */
export const isStartClosed = (facts: Pick<ExamFacts, "startDeadline" | "now">): boolean => facts.now.getTime() > facts.startDeadline.getTime();

/** Strictly after the deadline: at the deadline's instant the activity is still on time. */
export const isPastDeadline = (facts: Pick<AssignmentFacts, "deadline" | "now">): boolean => facts.now.getTime() > facts.deadline.getTime();

/** At least one attempt concluded: the latest one, or any before it (013 K3). */
export const hasConcluded = (facts: Pick<ExerciseFacts, "latestAttempt">): boolean =>
  facts.latestAttempt !== null && (facts.latestAttempt.status === "SUBMITTED" || facts.latestAttempt.number > 1);
