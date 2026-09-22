import type { AccountStatus, InvitationStatus, RoleAssignmentStatus, RoleKey, TeacherStatus } from "@repo/contracts";

/** Web texts for the contract's role keys (the API sends keys, never labels). */
export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor de cadastros",
  TEACHER: "Professor",
  STUDENT: "Aluno",
};

/** Web texts for every status the screens show (accounts, role assignments, teachers, invitations). */
export const STATUS_LABELS: Record<AccountStatus | RoleAssignmentStatus | TeacherStatus | InvitationStatus, string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  INACTIVE: "Inativo",
  INVITED: "Convidado",
  PENDING: "Pendente",
  ACCEPTED: "Aceito",
  EXPIRED: "Expirado",
  REVOKED: "Revogado",
};
