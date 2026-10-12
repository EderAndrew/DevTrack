import type { InvitationListResponse, InvitationView, InviteRequest, TeacherListResponse, TeacherStatus, TeacherView } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** Teacher administration by MANAGER (001/US5). The API authorizes and validates every call. */
export const teachersApi = {
  list: (status?: TeacherStatus) => apiClient.get<TeacherListResponse>(`/teachers${status ? `?status=${status}` : ""}`),
  invitations: () => apiClient.get<InvitationListResponse>("/teacher-invitations"),
  invite: ({ email, displayName }: InviteRequest) =>
    apiClient.post<InvitationView>("/teacher-invitations", { email, displayName } satisfies InviteRequest),
  resendInvitation: (id: string) => apiClient.post<InvitationView>(`/teacher-invitations/${id}/resend`),
  revokeInvitation: (id: string) => apiClient.post<InvitationView>(`/teacher-invitations/${id}/revoke`),
  suspend: (userId: string) => apiClient.post<TeacherView>(`/teachers/${userId}/suspend`),
  deactivate: (userId: string) => apiClient.post<TeacherView>(`/teachers/${userId}/deactivate`),
  reactivate: (userId: string) => apiClient.post<TeacherView>(`/teachers/${userId}/reactivate`),
};
