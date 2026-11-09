import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";

// 025 (contracts/http-api.md "Schemas", research N6): the teacher's discreet warning to one student
// in an exam. The warning's text is fixed in the web, never in a contract or the database; statuses
// are derived on read (data-model "Derived").

/** PENDING until the student closes it (DISMISSED); UNSEEN when the attempt ended with it pending. */
export const ExamNudgeStatusSchema = z.enum(["PENDING", "DISMISSED", "UNSEEN"]);
export type ExamNudgeStatus = z.infer<typeof ExamNudgeStatusSchema>;

/** One warning as the teacher sees it (the room's history, the timeline and the review). */
export const TeacherExamNudgeSchema = z.strictObject({
  id: UuidSchema,
  sentAt: IsoDateTimeSchema,
  dismissedAt: IsoDateTimeSchema.nullable(),
  status: ExamNudgeStatusSchema,
});
export type TeacherExamNudge = z.infer<typeof TeacherExamNudgeSchema>;

/** A student's warnings in the exam monitor: whether the bell is enabled and what was sent. */
export const ExamNudgeSummarySchema = z.strictObject({
  canSend: z.boolean(),
  pendingSince: IsoDateTimeSchema.nullable(),
  sentCount: z.int().min(0),
  lastDismissedAt: IsoDateTimeSchema.nullable(),
});
export type ExamNudgeSummary = z.infer<typeof ExamNudgeSummarySchema>;

/** `POST …/attempts/:attemptId/exam-nudges`: the body is exactly `{}`. */
export const SendExamNudgeRequestSchema = z.strictObject({});
export type SendExamNudgeRequest = z.infer<typeof SendExamNudgeRequestSchema>;

export const SendExamNudgeResponseSchema = z.strictObject({ nudge: TeacherExamNudgeSchema });
export type SendExamNudgeResponse = z.infer<typeof SendExamNudgeResponseSchema>;

/** `GET /me/activities/:activityId/attempt/exam-nudge`: the warning only while it is shown, else `null`. */
export const StudentExamNudgeSchema = z.strictObject({
  nudge: z.strictObject({ id: UuidSchema, studentName: z.string() }).nullable(),
});
export type StudentExamNudge = z.infer<typeof StudentExamNudgeSchema>;

/** `POST /me/activities/:activityId/attempt/exam-nudge/:nudgeId/dismiss`: the body is exactly `{}`. */
export const DismissExamNudgeRequestSchema = z.strictObject({});
export type DismissExamNudgeRequest = z.infer<typeof DismissExamNudgeRequestSchema>;
