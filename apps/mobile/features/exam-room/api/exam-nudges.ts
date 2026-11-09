import { type SendExamNudgeResponse, SendExamNudgeResponseSchema, UuidSchema } from "@repo/contracts";
import { ApiError } from "../../../lib/api/client";
import { apiClient } from "../../../lib/api/instance";

/**
 * `POST /classes/:classId/activities/:activityId/attempts/:attemptId/exam-nudges` (025/US1): the bell sends the
 * student a discreet warning, the app's only write about the exam (025/FR-007); the body is exactly `{}` and the
 * text is never sent (FR-006). The ids come from the route and the room, so only UUIDs reach the path.
 */
export async function sendNudge(classId: string, activityId: string, attemptId: string): Promise<SendExamNudgeResponse> {
  if (![classId, activityId, attemptId].every((id) => UuidSchema.safeParse(id).success)) throw new ApiError(404, "NOT_FOUND", "Invalid id");
  return apiClient().request("POST", `/classes/${classId}/activities/${activityId}/attempts/${attemptId}/exam-nudges`, {
    body: {},
    schema: SendExamNudgeResponseSchema,
  });
}
