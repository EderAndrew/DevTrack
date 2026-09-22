import type { InvitationListResponse, InvitationView, InviteRequest, ManagerListResponse, ManagerView } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** MANAGER administration by ADMIN (001/US4). The API authorizes and validates every call. */
export const managersApi = {
  list: () => apiClient.get<ManagerListResponse>("/managers"),
  invitations: () => apiClient.get<InvitationListResponse>("/manager-invitations"),
  invite: ({ email, displayName }: InviteRequest) =>
    apiClient.post<InvitationView>("/manager-invitations", { email, displayName } satisfies InviteRequest),
  resendInvitation: (id: string) => apiClient.post<InvitationView>(`/manager-invitations/${id}/resend`),
  revokeInvitation: (id: string) => apiClient.post<InvitationView>(`/manager-invitations/${id}/revoke`),
  deactivate: (userId: string) => apiClient.post<ManagerView>(`/managers/${userId}/deactivate`),
  reactivate: (userId: string) => apiClient.post<ManagerView>(`/managers/${userId}/reactivate`),
};
