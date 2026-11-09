import type { StudentExamNudge, TeacherExamNudge } from "@repo/contracts";
import { type NudgeAttemptFacts, nudgeStatus } from "./nudge-status";

/** A warning as read from `exam_nudges` (025 data-model). */
export interface StoredExamNudge {
  id: string;
  sentAt: Date;
  dismissedAt: Date | null;
}

/**
 * The teacher's view of one warning (the app's room, the monitor, the timeline and the review): a closed list
 * of fields copied one by one, the status derived with the server's `now` (research N6).
 */
export const toTeacherExamNudge = (row: StoredExamNudge, facts: NudgeAttemptFacts, now: Date): TeacherExamNudge => ({
  id: row.id,
  sentAt: row.sentAt.toISOString(),
  dismissedAt: row.dismissedAt?.toISOString() ?? null,
  status: nudgeStatus(row, facts, now),
});

/**
 * The student's view while the warning is shown: its id and the student's own name from the server (FR-009);
 * never the teacher, the time or the history (FR-016). The text itself is fixed in the web.
 */
export const toStudentExamNudge = (row: Pick<StoredExamNudge, "id">, studentName: string): NonNullable<StudentExamNudge["nudge"]> => ({
  id: row.id,
  studentName,
});
