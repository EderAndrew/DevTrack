import type {
  ActivityType,
  SaveAnswersRequest,
  SaveAnswersResult,
  StartAttemptRequest,
  StudentActivity,
  StudentActivityFilter,
  StudentActivityPage,
  StudentDashboard,
  StudentExerciseAttempt,
  SubmitAttemptRequest,
} from "@repo/contracts";
import { ApiError, apiClient, NETWORK_ERROR } from "@/lib/api/client";

export interface StudentActivityListFilters {
  status: StudentActivityFilter | null;
  type: ActivityType | null;
}

/** The student's own activities (012 contracts/http-api.md, "Student routes"); identity from the session only. */
export const studentActivitiesApi = {
  dashboard: () => apiClient.get<StudentDashboard>("/me/dashboard"),
  list: (filters: StudentActivityListFilters, cursor: string | null) => {
    const query = new URLSearchParams({
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(cursor ? { cursor } : {}),
    });
    return apiClient.get<StudentActivityPage>(`/me/activities${query.size > 0 ? `?${query}` : ""}`);
  },
  get: (activityId: string) => apiClient.get<StudentActivity>(`/me/activities/${activityId}`),
  /** The single attempt; an existing one comes back as it is (FR-016). An exam sends `acceptRules: true` (018). */
  start: (activityId: string, body: StartAttemptRequest = {}) => apiClient.post<StudentActivity>(`/me/activities/${activityId}/attempt`, body),
  /** SAVED / UNCHANGED / CONFLICT per answer (research P8). */
  saveAnswers: (activityId: string, body: SaveAnswersRequest) =>
    apiClient.put<SaveAnswersResult>(`/me/activities/${activityId}/attempt/answers`, body),
  /** The single submission with the pending answers; a repeat returns the same one (FR-025). */
  submit: (activityId: string, body: SubmitAttemptRequest) =>
    apiClient.post<StudentActivity>(`/me/activities/${activityId}/attempt/submit`, body),
  /** "Refazer" an Exercício (013, research K4): a repeat returns the attempt it already opened. */
  retry: (activityId: string, afterNumber: number) =>
    apiClient.post<StudentActivity>(`/me/activities/${activityId}/attempts`, { afterNumber }),
  /** "Concluir exercícios" with the pending answers; a repeat returns the same conclusion (013/FR-007). */
  complete: (activityId: string, number: number, body: SubmitAttemptRequest) =>
    apiClient.post<StudentActivity>(`/me/activities/${activityId}/attempts/${number}/complete`, body),
  /** A concluded attempt with its answer key (013/FR-012). */
  attempt: (activityId: string, number: number) =>
    apiClient.get<StudentExerciseAttempt>(`/me/activities/${activityId}/attempts/${number}`),
};

export type { ApiError };

/** Any failure of a call as an `ApiError` (its `code` picks the message of the error catalog). */
export const toApiError = (error: unknown): ApiError => (error instanceof ApiError ? error : new ApiError(0, "UNKNOWN", ""));

/** The request got no answer: the "sem conexão" state, apart from a load error (FR-033, SC-010). */
export const isOffline = (error: unknown) => error instanceof ApiError && error.code === NETWORK_ERROR;
