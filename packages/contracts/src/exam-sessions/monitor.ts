import { z } from "zod";
import { TeacherPauseSchema } from "../attendance/pauses.js";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { TeacherExamHoldSchema } from "./holds.js";

// The teacher's exam monitor (018 contracts/http-api.md, research T12), polled every 5 s. Every
// status, time and count is derived on read with the server's clock (data-model "Derived").

/**
 * A student's situation in an exam: no presence → NOT_MARKED; present without an attempt → PRESENT
 * until the start deadline, START_CLOSED after; an open hold → AWAITING_DECISION; a submission → its
 * end reason (SUBMITTED for the student's own); an open pause → PAUSED; otherwise ANSWERING.
 */
export const ExamStatusOfStudentSchema = z.enum([
  "NOT_MARKED",
  "PRESENT",
  "START_CLOSED",
  "ANSWERING",
  "PAUSED",
  "AWAITING_DECISION",
  "SUBMITTED",
  "TIME_EXPIRED",
  "ACTIVITY_CLOSED",
  "ENDED_BY_WARNINGS",
  "CANCELLED",
]);
export type ExamStatusOfStudent = z.infer<typeof ExamStatusOfStudentSchema>;

export const ExamMonitorStudentSchema = z.strictObject({
  studentUserId: UuidSchema,
  name: z.string(),
  markedAt: IsoDateTimeSchema.nullable(),
  examStatus: ExamStatusOfStudentSchema,
  attemptId: UuidSchema.nullable(),
  startedAt: IsoDateTimeSchema.nullable(),
  /** `startedAt + duration`, capped by the activity's close or cancellation. */
  endsAt: IsoDateTimeSchema.nullable(),
  occurrenceCount: z.int().min(0),
  openHold: TeacherExamHoldSchema.nullable(),
  openPause: TeacherPauseSchema.nullable(),
});
export type ExamMonitorStudent = z.infer<typeof ExamMonitorStudentSchema>;

/** `GET /classes/:classId/activities/:activityId/exam-monitor`: students on hold first, then paused. */
export const ExamMonitorSchema = z.strictObject({
  activityId: UuidSchema,
  durationMinutes: z.int().min(1),
  startDeadline: IsoDateTimeSchema,
  closesAt: IsoDateTimeSchema,
  serverNow: IsoDateTimeSchema,
  students: z.array(ExamMonitorStudentSchema),
});
export type ExamMonitor = z.infer<typeof ExamMonitorSchema>;
