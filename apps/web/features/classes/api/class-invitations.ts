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

/** Invitations of a teacher's class (003 contracts/http-api.md, "Convites da turma"). */
export const classInvitationsApi = {
  list: (classId: string, params: ClassInvitationListQuery) =>
    apiClient.get<ClassInvitationPage>(`/classes/${classId}/invitations${search(params)}`),
  invite: (classId: string, body: InviteStudentRequest) =>
    apiClient.post<ClassInvitationView>(`/classes/${classId}/invitations`, body),
  resend: (classId: string, invitationId: string) =>
    apiClient.post<ClassInvitationView>(`/classes/${classId}/invitations/${invitationId}/resend`, {} satisfies EmptyBody),
  cancel: (classId: string, invitationId: string) =>
    apiClient.post<ClassInvitationView>(`/classes/${classId}/invitations/${invitationId}/cancel`, {} satisfies EmptyBody),
};
