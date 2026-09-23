import type {
  AcceptClassInvitationRequest,
  ClassInvitationAccepted,
  ClassInvitationPreview,
  TokenRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** Public side of a class invitation (003 D11): preview of the link and acceptance. */
export const classInvitationAcceptanceApi = {
  preview: (token: string) =>
    apiClient.post<ClassInvitationPreview>("/class-invitations/preview", { token } satisfies TokenRequest),
  accept: (body: AcceptClassInvitationRequest) => apiClient.post<ClassInvitationAccepted>("/class-invitations/accept", body),
};
