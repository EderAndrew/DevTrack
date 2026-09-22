import type { AcceptInvitationRequest, InvitationAccepted, InvitationPreview, TokenRequest } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** Public side of a MANAGER/TEACHER invitation (001/R15): preview of the link and acceptance. */
export const invitationsApi = {
  preview: (token: string) => apiClient.post<InvitationPreview>("/invitations/preview", { token } satisfies TokenRequest),
  /** `password` only for CREATE_ACCOUNT/CLAIM_ACCOUNT; SIGN_IN_REQUIRED relies on the session. */
  accept: ({ token, password }: AcceptInvitationRequest) =>
    apiClient.post<InvitationAccepted>(
      "/invitations/accept",
      (password === undefined ? { token } : { token, password }) satisfies AcceptInvitationRequest,
    ),
};
