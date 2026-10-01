import type { ActivityStatus, AttemptStatus, LatePolicy } from "@repo/contracts";

/**
 * What the situation of a student in an activity is derived from (012 contracts/student-status.md).
 * Nothing derived from these facts is stored: every read derives it again with the server clock
 * (constitution III, research P4, P11).
 */
export interface ActivityFacts {
  activityStatus: ActivityStatus;
  deadline: Date;
  latePolicy: LatePolicy;
  /** The class is ACTIVE (a class not ACTIVE is read-only for its students). */
  classActive: boolean;
  attempt: { status: AttemptStatus } | null;
  submission: { late: boolean; gradingComplete: boolean } | null;
  /** The teacher released the activity's result (research P14). */
  released: boolean;
  /** The server clock. */
  now: Date;
}

/** Strictly after the deadline: at the deadline's instant the activity is still on time. */
export const isPastDeadline = (facts: Pick<ActivityFacts, "deadline" | "now">): boolean => facts.now.getTime() > facts.deadline.getTime();
