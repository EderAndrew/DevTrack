import type { IntegrityEventInput, RecordIntegrityEventsResult, StudentIntegrity } from "@repo/contracts";
import { ApiError, apiClient, NETWORK_ERROR } from "@/lib/api/client";

/** The controlled mode's routes of the student's own attempt (015 contracts/http-api.md). */
export const integrityApi = {
  /** 1–50 events; the answer carries the server's time of each (a resend → the time stored first). */
  record: (activityId: string, events: readonly IntegrityEventInput[], options: { keepalive?: boolean } = {}) =>
    apiClient.post<RecordIntegrityEventsResult>(`/me/activities/${activityId}/attempt/events`, { events }, options),
  own: (activityId: string) => apiClient.get<StudentIntegrity>(`/me/activities/${activityId}/attempt/integrity`),
};

/** No answer at all: the events wait in this browser. */
export const isNetworkFailure = (error: unknown) => error instanceof ApiError && error.code === NETWORK_ERROR;

/** Worth sending again later: no answer, a rate limit or a server failure; a refusal (4xx) is final. */
export const isRetryable = (error: unknown) =>
  !(error instanceof ApiError) || error.code === NETWORK_ERROR || error.status === 429 || error.status >= 500;
