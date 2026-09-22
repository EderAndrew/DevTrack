import type { AdminActivated, AdminActivationPreview, AdminActivationRequest, TokenRequest } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** First-ADMIN bootstrap (001/R14): preview of the link and its completion. */
export const adminActivationApi = {
  preview: (token: string) =>
    apiClient.post<AdminActivationPreview>("/admin-activation/preview", { token } satisfies TokenRequest),
  /** `password` only for CREATE_ACCOUNT/CLAIM_ACCOUNT; SIGN_IN_REQUIRED relies on the session. */
  activate: ({ token, password }: AdminActivationRequest) =>
    apiClient.post<AdminActivated>(
      "/admin-activation",
      (password === undefined ? { token } : { token, password }) satisfies AdminActivationRequest,
    ),
};
