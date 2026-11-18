import type {
  ClassInvitationListQuery,
  ClassInvitationPage,
  ClassInvitationView,
  EmptyBody,
  InviteStudentRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const search = (params: ClassInvitationListQuery) => {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `?${query}` : "";
};

/**
 * Invitations of a turma (003 "Convites da turma"; since 027 the MANAGER's, `/cohorts/:id/invitations`). The id is
 * the turma's; the teacher's class pages lose their "Convites" with 027 T044.
 */
export const cohortInvitationsApi = {
  list: (cohortId: string, params: ClassInvitationListQuery) =>
    apiClient.get<ClassInvitationPage>(`/cohorts/${cohortId}/invitations${search(params)}`),
  invite: (cohortId: string, body: InviteStudentRequest) =>
    apiClient.post<ClassInvitationView>(`/cohorts/${cohortId}/invitations`, body),
  resend: (cohortId: string, invitationId: string) =>
    apiClient.post<ClassInvitationView>(`/cohorts/${cohortId}/invitations/${invitationId}/resend`, {} satisfies EmptyBody),
  cancel: (cohortId: string, invitationId: string) =>
    apiClient.post<ClassInvitationView>(`/cohorts/${cohortId}/invitations/${invitationId}/cancel`, {} satisfies EmptyBody),
};
