import { type ExamAlertPreference, ExamAlertPreferenceSchema, UuidSchema } from "@repo/contracts";
import { ApiError } from "../../../lib/api/client";
import { apiClient } from "../../../lib/api/instance";

/**
 * `PUT /classes/:classId/activities/:activityId/exam-alerts` (024/US4): turns the exam's alerts off or on for all
 * of the teacher's phones; idempotent. The ids come from the route, so only UUIDs reach the path.
 */
export async function setExamAlerts(classId: string, activityId: string, muted: boolean): Promise<ExamAlertPreference> {
  if (![classId, activityId].every((id) => UuidSchema.safeParse(id).success)) throw new ApiError(404, "NOT_FOUND", "Invalid id");
  return apiClient().request("PUT", `/classes/${classId}/activities/${activityId}/exam-alerts`, { body: { muted }, schema: ExamAlertPreferenceSchema });
}
