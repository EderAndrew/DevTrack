import type {
  AccountStatus,
  ClassPlanStatus,
  ClassInvitationStatus,
  ClassStatus,
  EnrollmentStatus,
  InvitationStatus,
  RoleAssignmentStatus,
  RoleKey,
  SubjectStatus,
  TeacherStatus,
} from "@repo/contracts";

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

/** Status of a class ("turma" is feminine in Portuguese, hence its own texts). */
export const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  ARCHIVED: "Arquivada",
};

/** Status of a class invitation ("convite" is masculine). */
export const CLASS_INVITATION_STATUS_LABELS: Record<ClassInvitationStatus, string> = {
  PENDING: "Pendente",
  ACCEPTED: "Aceito",
  EXPIRED: "Expirado",
  CANCELLED: "Cancelado",
};

/** Status of an enrollment ("matrícula" is feminine). */
export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ACTIVE: "Ativa",
  REMOVED: "Removida",
};

/** Status of a subject ("disciplina" is feminine). */
export const SUBJECT_STATUS_LABELS: Record<SubjectStatus, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
};

/** Status of a class plan ("planejamento" is masculine). */
export const CLASS_PLAN_STATUS_LABELS: Record<ClassPlanStatus, string> = {
  DRAFT: "Rascunho",
  READY: "Pronto",
  ACTIVE: "Em andamento",
  ARCHIVED: "Arquivado",
};
