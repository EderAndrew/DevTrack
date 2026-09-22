import { apiClient } from "./api-client";
import type { AcceptanceMode } from "./auth-api";

/** Views of contracts/http-api.md (dates as ISO strings). */
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
export type RoleAssignmentStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";

export interface InvitationView {
  id: string;
  email: string;
  displayName: string;
  role: "MANAGER" | "TEACHER";
  status: InvitationStatus;
  expiresAt: string;
  sendCount: number;
  lastSentAt: string;
  invitedBy: { id: string; name: string };
}

export interface ManagerView {
  userId: string;
  name: string;
  email: string;
  status: RoleAssignmentStatus;
}

export interface UserAccountView {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  status: "ACTIVE" | "SUSPENDED";
  roles: { key: string; status: RoleAssignmentStatus }[];
  createdAt: string;
}

export type TeacherStatus = "INVITED" | RoleAssignmentStatus;

export interface TeacherListItem {
  userId: string | null;
  invitationId: string | null;
  displayName: string;
  email: string;
  status: TeacherStatus;
}

export interface TeacherView {
  userId: string;
  displayName: string;
  email: string;
  status: RoleAssignmentStatus;
  invitations: InvitationView[];
}

export interface AccountPage {
  items: UserAccountView[];
  nextCursor: string | null;
}

export interface InvitationPreview {
  role: "MANAGER" | "TEACHER";
  email: string;
  displayName: string;
  mode: AcceptanceMode;
}

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return search ? `?${search}` : "";
};

export const adminApi = {
  inviteManager: (email: string, displayName: string) =>
    apiClient.post<InvitationView>("/manager-invitations", { email, displayName }),
  resendManagerInvitation: (id: string) => apiClient.post<InvitationView>(`/manager-invitations/${id}/resend`),
  revokeManagerInvitation: (id: string) => apiClient.post<InvitationView>(`/manager-invitations/${id}/revoke`),
  deactivateManager: (userId: string) => apiClient.post<ManagerView>(`/managers/${userId}/deactivate`),
  reactivateManager: (userId: string) => apiClient.post<ManagerView>(`/managers/${userId}/reactivate`),
  listTeachers: (status?: TeacherStatus) => apiClient.get<{ items: TeacherListItem[] }>(`/teachers${query({ status })}`),
  inviteTeacher: (email: string, displayName: string) =>
    apiClient.post<InvitationView>("/teacher-invitations", { email, displayName }),
  resendTeacherInvitation: (id: string) => apiClient.post<InvitationView>(`/teacher-invitations/${id}/resend`),
  revokeTeacherInvitation: (id: string) => apiClient.post<InvitationView>(`/teacher-invitations/${id}/revoke`),
  suspendTeacher: (userId: string) => apiClient.post<TeacherView>(`/teachers/${userId}/suspend`),
  deactivateTeacher: (userId: string) => apiClient.post<TeacherView>(`/teachers/${userId}/deactivate`),
  reactivateTeacher: (userId: string) => apiClient.post<TeacherView>(`/teachers/${userId}/reactivate`),
  listUsers: (params: { query?: string; cursor?: string }) => apiClient.get<AccountPage>(`/users${query(params)}`),
  suspendUser: (id: string) => apiClient.post<UserAccountView>(`/users/${id}/suspend`),
  reactivateUser: (id: string) => apiClient.post<UserAccountView>(`/users/${id}/reactivate`),
};

export const invitationApi = {
  preview: (token: string) => apiClient.post<InvitationPreview>("/invitations/preview", { token }),
  /** `password` only for CREATE_ACCOUNT/CLAIM_ACCOUNT; SIGN_IN_REQUIRED relies on the session. */
  accept: (token: string, password?: string) =>
    apiClient.post<{ role: "MANAGER" | "TEACHER"; mode: AcceptanceMode }>(
      "/invitations/accept",
      password === undefined ? { token } : { token, password },
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
