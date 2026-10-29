import type { ActivityFacts } from "../activities/status/facts";
import { assignmentSchedule } from "../activities/status/facts";
import type { OwnAttemptContext } from "./student-activity-loader";

/**
 * The 012 facts of the student's open attempt of a work, for the deadline rule of a save
 * (`decideOperation("SAVE", …)`): what the 015 help and, since 021 (research Y4), a work's code run
 * ask before writing anything, so neither gets around the save rule.
 */
export function saveFactsOf(context: OwnAttemptContext, now: Date): ActivityFacts {
  return {
    type: "ASSIGNMENT",
    activityStatus: context.activityStatus,
    ...assignmentSchedule(context),
    classActive: context.classActive,
    attempt: context.attempt && { status: context.attempt.status },
    submission: null,
    released: false,
    now,
  };
}
