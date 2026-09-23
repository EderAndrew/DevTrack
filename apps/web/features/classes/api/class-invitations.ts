import type { ClassInvitationView, InviteStudentRequest } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** Invitations of a teacher's class (003 contracts/http-api.md, "Convites da turma"). */
export const classInvitationsApi = {
  invite: (classId: string, body: InviteStudentRequest) =>
    apiClient.post<ClassInvitationView>(`/classes/${classId}/invitations`, body),
};
