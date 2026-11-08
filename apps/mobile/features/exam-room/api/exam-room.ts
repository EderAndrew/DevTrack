import { type ExamMonitor, ExamMonitorSchema, type IntegrityTimeline, IntegrityTimelineSchema } from "@repo/contracts";
import { ApiError, NETWORK_ERROR } from "../../../lib/api/client";
import { apiClient } from "../../../lib/api/instance";

// 024 research Y10: the room is read with the 018 routes the web uses (the only reads of the app).

export function getExamMonitor(classId: string, activityId: string): Promise<ExamMonitor> {
  return apiClient().request("GET", `/classes/${classId}/activities/${activityId}/exam-monitor`, { schema: ExamMonitorSchema });
}

export function getAttemptTimeline(classId: string, activityId: string, attemptId: string): Promise<IntegrityTimeline> {
  return apiClient().request("GET", `/classes/${classId}/activities/${activityId}/attempts/${attemptId}/integrity`, { schema: IntegrityTimelineSchema });
}

/** The request never got an answer: the room shows the last one with its time (024/US2-7). */
export const isOffline = (error: unknown) => error instanceof ApiError && error.code === NETWORK_ERROR;

/** The API answered with a refusal (e.g. 404, the room is no longer the teacher's): not a connection problem. */
export const isRefused = (error: unknown) => error instanceof ApiError && error.code !== NETWORK_ERROR;
