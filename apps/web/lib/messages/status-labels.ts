import type {
  AccountStatus,
  ClassPlanStatus,
  ClassInvitationStatus,
  ClassStatus,
  DeliveryIssue,
  DeliveryState,
  EnrollmentStatus,
  InvitationStatus,
  RoleAssignmentStatus,
  RoleKey,
  SubjectStatus,
  SyllabusFailureCategory,
  SyllabusProcessingStatus,
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

/** Processing of a syllabus document (004 contracts/web-ui.md, "Situação"). */
export const SYLLABUS_PROCESSING_STATUS_LABELS: Record<SyllabusProcessingStatus, string> = {
  UPLOADED: "Enviado",
  PROCESSING: "Processando",
  PROCESSED: "Processado",
  FAILED: "Falhou",
};

/** Why processing failed, completing "O processamento falhou: …". */
export const SYLLABUS_FAILURE_LABELS: Record<SyllabusFailureCategory, string> = {
  UNREADABLE: "arquivo ilegível",
  TIMEOUT: "tempo esgotado",
  INTERNAL: "erro interno",
};

/**
 * The e-mail of a pending invitation (003 FR-019, 017 contracts/web-ui.md): the badge text of each
 * delivery situation; nothing is shown for a sent e-mail.
 */
export const DELIVERY_LABELS: Record<Exclude<DeliveryState, "SENT">, string> = {
  SENDING: "Enviando",
  FAILED: "Envio falhou",
  UNDELIVERED: "Não entregue",
};

/** Why an e-mail was not delivered, in words next to the "Não entregue" badge (017/FR-015). */
export const DELIVERY_ISSUE_TEXTS: Record<DeliveryIssue, string> = {
  BOUNCED: "O endereço não existe ou recusou a mensagem.",
  REJECTED: "O endereço não existe ou recusou a mensagem.",
  COMPLAINED: "Marcado como spam pelo destinatário.",
};
