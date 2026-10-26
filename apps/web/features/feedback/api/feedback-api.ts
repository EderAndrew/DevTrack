import type {
  AdminFeedback,
  AdminFeedbackPage,
  ChangeFeedbackStatusRequest,
  CreateFeedbackRequest,
  FeedbackSummary,
  ListAdminFeedbacksQuery,
  StudentFeedback,
  StudentFeedbackPage,
} from "@repo/contracts";
import { ApiError, apiClient, NETWORK_ERROR } from "@/lib/api/client";

/** The student's feedback (020 contracts/http-api.md, "Student"). */
export const feedbackApi = {
  /** 201 for a new feedback; the same `submissionId` answers the stored one (200). */
  send: (body: CreateFeedbackRequest) => apiClient.post<StudentFeedback>("/me/feedbacks", body),
  /** "Meus feedbacks": newest first, 50 per page. */
  listMine: (cursor: string | null) =>
    apiClient.get<StudentFeedbackPage>(cursor ? `/me/feedbacks?${new URLSearchParams({ cursor }).toString()}` : "/me/feedbacks"),
};

const search = (params: ListAdminFeedbacksQuery) => {
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
  return query ? `?${query}` : "";
};

/** The ADMIN's feedbacks (020 contracts/http-api.md, "ADMIN"). */
export const adminFeedbackApi = {
  list: (params: ListAdminFeedbacksQuery) => apiClient.get<AdminFeedbackPage>(`/feedbacks${search(params)}`),
  summary: () => apiClient.get<FeedbackSummary>("/feedbacks/summary"),
  get: (id: string) => apiClient.get<AdminFeedback>(`/feedbacks/${id}`),
  changeStatus: (id: string, body: ChangeFeedbackStatusRequest) => apiClient.post<AdminFeedback>(`/feedbacks/${id}/status`, body),
};

/** Why a send failed, in the terms the dialog shows (contracts/web-ui.md). */
export type SendFailure = { kind: "limit"; retryAfterSeconds: number } | { kind: "network" } | { kind: "other"; error: unknown };

export function sendFailure(error: unknown): SendFailure {
  if (error instanceof ApiError && error.code === "RATE_LIMITED") return { kind: "limit", retryAfterSeconds: error.retryAfterSeconds ?? 3600 };
  if (error instanceof ApiError && error.code === NETWORK_ERROR) return { kind: "network" };
  return { kind: "other", error };
}

/** Another ADMIN changed the status first: the detail is refetched (contracts/web-ui.md). */
export const isStatusConflict = (error: unknown) => error instanceof ApiError && error.code === "INVALID_STATE_TRANSITION";
