import type { ExamMonitor, IntegrityTimeline, TeacherExamHold } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const activityPath = (classId: string, activityId: string) => `/classes/${classId}/activities/${activityId}`;

/** The three decisions on a hold (018 contracts/http-api.md), keyed by the hold. */
export type HoldDecision = "cancel" | "return" | "keep";

/** The teacher's exam in progress (018 research T9, T12). */
export const examSessionApi = {
  monitor: (classId: string, activityId: string) => apiClient.get<ExamMonitor>(`${activityPath(classId, activityId)}/exam-monitor`),
  decide: (classId: string, activityId: string, holdId: string, decision: HoldDecision) =>
    apiClient.post<TeacherExamHold>(`${activityPath(classId, activityId)}/exam-holds/${holdId}/${decision}`, {}),
  /** "Ver ocorrências": the attempt's events with their occurrence ordinals (015 review route, 018/FR-031). */
  occurrences: (classId: string, activityId: string, attemptId: string) =>
    apiClient.get<IntegrityTimeline>(`${activityPath(classId, activityId)}/attempts/${attemptId}/integrity`),
};
