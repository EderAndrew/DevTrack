import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";

// 024 (contracts/http-api.md, contracts/push-notifications.md, research Y5, Y8).

/** `PUT /classes/:classId/activities/:activityId/exam-alerts`: only the wanted state. */
export const ExamAlertPreferenceRequestSchema = z.strictObject({ muted: z.boolean() });
export type ExamAlertPreferenceRequest = z.infer<typeof ExamAlertPreferenceRequestSchema>;

export const ExamAlertPreferenceSchema = z.strictObject({ muted: z.boolean() });
export type ExamAlertPreference = z.infer<typeof ExamAlertPreferenceSchema>;

export const ExamAlertKindSchema = z.enum(["OCCURRENCE", "HOLD"]);
export type ExamAlertKind = z.infer<typeof ExamAlertKindSchema>;

/**
 * The `data` of an alert's push message: what the app needs to open the right room, ids only. The app
 * re-reads everything from the API before showing it (FR-017).
 */
export const ExamAlertPushDataSchema = z.strictObject({
  kind: ExamAlertKindSchema,
  classId: UuidSchema,
  activityId: UuidSchema,
  studentUserId: UuidSchema,
});
export type ExamAlertPushData = z.infer<typeof ExamAlertPushDataSchema>;
