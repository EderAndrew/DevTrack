import type { StudentExamNudge } from "@repo/contracts";
import { ApiError, apiClient, NETWORK_ERROR } from "@/lib/api/client";

const nudgePath = (activityId: string) => `/me/activities/${activityId}/attempt/exam-nudge`;

/** The student's discreet warning of the own exam attempt (025 contracts/http-api.md, "Routes"). */
export const examNudgeApi = {
  /** The pending warning while it is shown, else `null`; polled every 5 s. */
  get: (activityId: string) => apiClient.get<StudentExamNudge>(nudgePath(activityId)),
  /** "Entendi": the body is exactly `{}`; `{ nudge: null }` also when already dismissed. */
  dismiss: (activityId: string, nudgeId: string) => apiClient.post<StudentExamNudge>(`${nudgePath(activityId)}/${nudgeId}/dismiss`, {}),
};

/** Worth sending the dismissal again later: no answer, a rate limit or a server failure; a refusal (4xx) is final. */
export const isRetryable = (error: unknown) =>
  !(error instanceof ApiError) || error.code === NETWORK_ERROR || error.status === 429 || error.status >= 500;
