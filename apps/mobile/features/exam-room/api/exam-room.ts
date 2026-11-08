import { type ExamMonitor, ExamMonitorSchema, type IntegrityTimeline, IntegrityTimelineSchema, UuidSchema } from "@repo/contracts";
import { ApiError, NETWORK_ERROR } from "../../../lib/api/client";
import { apiClient } from "../../../lib/api/instance";

// 024 research Y10: the room is read with the 018 routes the web uses (the only reads of the app).

/**
 * The ids come from the route, which a `devtrack://` link from another app can fill: only UUIDs reach the
 * request path (OWASP audit of T025, A03); anything else is the same "no longer available" as a 404.
 */
async function assertIds(...ids: string[]): Promise<void> {
  if (!ids.every((id) => UuidSchema.safeParse(id).success)) throw new ApiError(404, "NOT_FOUND", "Invalid id");
}

export async function getExamMonitor(classId: string, activityId: string): Promise<ExamMonitor> {
  await assertIds(classId, activityId);
  return apiClient().request("GET", `/classes/${classId}/activities/${activityId}/exam-monitor`, { schema: ExamMonitorSchema });
}

export async function getAttemptTimeline(classId: string, activityId: string, attemptId: string): Promise<IntegrityTimeline> {
  await assertIds(classId, activityId, attemptId);
  return apiClient().request("GET", `/classes/${classId}/activities/${activityId}/attempts/${attemptId}/integrity`, { schema: IntegrityTimelineSchema });
}

/** The request never got an answer: the room shows the last one with its time (024/US2-7). */
export const isOffline = (error: unknown) => error instanceof ApiError && error.code === NETWORK_ERROR;

/** The API answered with a refusal (e.g. 404, the room is no longer the teacher's): not a connection problem. */
export const isRefused = (error: unknown) => error instanceof ApiError && error.code !== NETWORK_ERROR;
