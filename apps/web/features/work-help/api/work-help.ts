import type { RequestHelp, StudentHelpItem, StudentHelpState } from "@repo/contracts";
import { ApiError, apiClient, NETWORK_ERROR } from "@/lib/api/client";

/** The AI help of the student's own attempt (015 contracts/http-api.md, "Student routes"). */
export const workHelpApi = {
  state: (activityId: string) => apiClient.get<StudentHelpState>(`/me/activities/${activityId}/attempt/help`),
  /** 202 with the pending request; the same idempotency key answers the same request (200). */
  request: (activityId: string, body: RequestHelp) => apiClient.post<StudentHelpItem>(`/me/activities/${activityId}/attempt/help`, body),
};

/** No answer at all: sending the same request again (same key) is safe. */
export const isNetworkFailure = (error: unknown) => error instanceof ApiError && error.code === NETWORK_ERROR;
