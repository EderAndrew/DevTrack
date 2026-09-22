import type {
  AcceptInvitationRequest,
  AccountPage,
  InvitationAccepted,
  InvitationPreview,
  InvitationView,
  InviteRequest,
  ManagerView,
  TeacherListResponse,
  TeacherStatus,
  TeacherView,
  TokenRequest,
  UserAccountView,
  UserListQuery,
} from "@repo/contracts";
import { apiClient } from "./api-client";

/** Types of @repo/contracts still imported from here by the screens (moved to features/ in US4). */
export type {
  AccountPage,
  InvitationPreview,
  InvitationView,
  ManagerView,
  TeacherListItem,
  TeacherStatus,
  UserAccountView,
} from "@repo/contracts";

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return search ? `?${search}` : "";
};

export const adminApi = {
  inviteManager: (email: string, displayName: string) =>
    apiClient.post<InvitationView>("/manager-invitations", { email, displayName } satisfies InviteRequest),
  resendManagerInvitation: (id: string) => apiClient.post<InvitationView>(`/manager-invitations/${id}/resend`),
  revokeManagerInvitation: (id: string) => apiClient.post<InvitationView>(`/manager-invitations/${id}/revoke`),
  deactivateManager: (userId: string) => apiClient.post<ManagerView>(`/managers/${userId}/deactivate`),
  reactivateManager: (userId: string) => apiClient.post<ManagerView>(`/managers/${userId}/reactivate`),
  listTeachers: (status?: TeacherStatus) => apiClient.get<TeacherListResponse>(`/teachers${query({ status })}`),
  inviteTeacher: (email: string, displayName: string) =>
    apiClient.post<InvitationView>("/teacher-invitations", { email, displayName } satisfies InviteRequest),
  resendTeacherInvitation: (id: string) => apiClient.post<InvitationView>(`/teacher-invitations/${id}/resend`),
  revokeTeacherInvitation: (id: string) => apiClient.post<InvitationView>(`/teacher-invitations/${id}/revoke`),
  suspendTeacher: (userId: string) => apiClient.post<TeacherView>(`/teachers/${userId}/suspend`),
  deactivateTeacher: (userId: string) => apiClient.post<TeacherView>(`/teachers/${userId}/deactivate`),
  reactivateTeacher: (userId: string) => apiClient.post<TeacherView>(`/teachers/${userId}/reactivate`),
  listUsers: (params: UserListQuery) => apiClient.get<AccountPage>(`/users${query(params)}`),
  suspendUser: (id: string) => apiClient.post<UserAccountView>(`/users/${id}/suspend`),
  reactivateUser: (id: string) => apiClient.post<UserAccountView>(`/users/${id}/reactivate`),
};

export const invitationApi = {
  preview: (token: string) => apiClient.post<InvitationPreview>("/invitations/preview", { token } satisfies TokenRequest),
  /** `password` only for CREATE_ACCOUNT/CLAIM_ACCOUNT; SIGN_IN_REQUIRED relies on the session. */
  accept: (token: string, password?: string) =>
    apiClient.post<InvitationAccepted>(
      "/invitations/accept",
      (password === undefined ? { token } : { token, password }) satisfies AcceptInvitationRequest,
    ),
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor de cadastros",
  TEACHER: "Professor",
  STUDENT: "Aluno",
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  INACTIVE: "Inativo",
  INVITED: "Convidado",
  PENDING: "Pendente",
  ACCEPTED: "Aceito",
  EXPIRED: "Expirado",
  REVOKED: "Revogado",
};

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
