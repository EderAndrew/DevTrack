import type { CreateFeedbackRequest, StudentFeedback } from "@repo/contracts";
import { ApiError, apiClient, NETWORK_ERROR } from "@/lib/api/client";

/** The student's feedback (020 contracts/http-api.md, "Student"). */
export const feedbackApi = {
  /** 201 for a new feedback; the same `submissionId` answers the stored one (200). */
  send: (body: CreateFeedbackRequest) => apiClient.post<StudentFeedback>("/me/feedbacks", body),
};

/** Why a send failed, in the terms the dialog shows (contracts/web-ui.md). */
export type SendFailure = { kind: "limit"; retryAfterSeconds: number } | { kind: "network" } | { kind: "other"; error: unknown };

export function sendFailure(error: unknown): SendFailure {
  if (error instanceof ApiError && error.code === "RATE_LIMITED") return { kind: "limit", retryAfterSeconds: error.retryAfterSeconds ?? 3600 };
  if (error instanceof ApiError && error.code === NETWORK_ERROR) return { kind: "network" };
  return { kind: "other", error };
}
