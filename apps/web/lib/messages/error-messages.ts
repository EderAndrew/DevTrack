import type { ErrorCode } from "@repo/contracts";
import { ApiError, NETWORK_ERROR, UNEXPECTED_RESPONSE } from "../api/client";

type ClientErrorCode = typeof NETWORK_ERROR | typeof UNEXPECTED_RESPONSE;

/**
 * User-facing text for every error code: the contract's codes plus the web's own (002 S8, FR-013).
 * The texts belong to the web, not to the API's `message`; they are the Phase 001 texts (FR-012)
 * plus the codes added by 003 (specs/003-class-invitations-enrollment/contracts/web-ui.md) and
 * 004 (specs/004-syllabus-planning/contracts/web-ui.md).
 */
export const ERROR_MESSAGES = {
  VALIDATION_ERROR: "Dados inválidos.",
  WEAK_PASSWORD: "A senha deve ter entre 12 e 128 caracteres e não pode ser uma senha comum.",
  PASSWORD_REQUIRED: "Defina uma senha para continuar.",
  TOKEN_INVALID: "Link inválido ou expirado.",
  TOKEN_EXPIRED: "Este convite expirou.",
  RA_REQUIRED: "Informe o RA.",
  FILE_TYPE_NOT_ALLOWED: "Envie um arquivo PDF, DOCX, PNG ou JPG.",
  FILE_UNREADABLE: "Não foi possível abrir este arquivo.",
  FILE_PROTECTED: "Este arquivo está protegido por senha.",
  FILE_MACROS: "Arquivos com macros não são aceitos.",
  FILE_TOO_COMPLEX: "O arquivo tem páginas ou conteúdo demais para processar.",
  UNAUTHENTICATED: "Autenticação necessária.",
  INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
  SIGN_IN_REQUIRED: "Entre na sua conta para continuar.",
  FORBIDDEN: "Você não possui permissão para esta operação.",
  EMAIL_NOT_VERIFIED: "Verifique seu e-mail para continuar.",
  ACCOUNT_SUSPENDED: "Esta conta está suspensa.",
  WRONG_ACCOUNT: "Você está conectado em outra conta. Entre com a conta do e-mail convidado.",
  SELF_INVITE_FORBIDDEN: "Não é possível convidar a si mesmo.",
  SELF_ACTION_FORBIDDEN: "Não é possível executar esta operação sobre a própria conta.",
  ORIGIN_NOT_ALLOWED: "Origem da requisição não permitida.",
  NOT_FOUND: "Recurso não encontrado.",
  INVALID_STATE_TRANSITION: "Operação não permitida no estado atual.",
  ALREADY_TEACHER: "Esta pessoa já é professor.",
  ALREADY_MANAGER: "Esta pessoa já é gestor de cadastros.",
  TEACHER_REACTIVATION_REQUIRED: "O papel de professor desta pessoa está suspenso ou inativo. Use a reativação.",
  INVITATION_ALREADY_PENDING: "Já existe um convite pendente para este e-mail. Reenvie o convite existente.",
  LAST_ADMIN_PROTECTED: "Não é possível remover o último administrador ativo.",
  BOOTSTRAP_ALREADY_DONE: "Bootstrap administrativo já realizado.",
  CLASS_CODE_TAKEN: "Você já tem uma turma com este código.",
  CLASS_NOT_OPEN: "Esta turma não aceita novos alunos.",
  ALREADY_ENROLLED: "Este aluno já está matriculado nesta turma.",
  RA_TAKEN: "Este RA já está em uso.",
  SUBJECT_NAME_TAKEN: "Você já tem uma disciplina com este nome.",
  SUBJECT_INACTIVE: "Esta disciplina está desativada. Reative-a para usá-la.",
  CLASS_SUBJECT_LOCKED: "A disciplina da turma não pode mais ser trocada: o planejamento já usa a ementa dela.",
  MEETINGS_OUTSIDE_PERIOD: "Há aulas marcadas fora das novas datas. Desmarque-as no calendário antes de mudar o período.",
  REVISION_DRAFT_EXISTS: "Já existe uma revisão em andamento para esta versão da ementa.",
  REVISION_CONFIRMED: "Este conteúdo já foi confirmado e não pode ser alterado.",
  MEETING_HAS_TOPICS: "Esta aula tem tópicos planejados. Escolha o que fazer com eles antes de desmarcá-la.",
  PLAN_REVISION_CONFLICT: "O planejamento foi alterado depois que você o abriu. Atualize a página antes de continuar.",
  PLAN_ARCHIVED: "Este planejamento está arquivado e não pode ser alterado.",
  FILE_TOO_LARGE: "O arquivo passa de 10 MB.",
  CLASS_NOT_PLANNABLE: "Informe a disciplina e as datas de início e término da turma para planejar.",
  EXTRACTION_UNAVAILABLE: "Não foi possível ler o texto deste arquivo. Preencha o conteúdo manualmente.",
  REVISION_EMPTY: "Inclua ao menos um item antes de confirmar.",
  REVISION_NOT_CONFIRMED: "Confirme o conteúdo da ementa antes de usá-lo.",
  MEETING_OUT_OF_PERIOD: "A data está fora do período da turma.",
  TOO_MANY_MEETINGS: "A turma pode ter no máximo 200 aulas.",
  SYLLABUS_REQUIRED: "Envie e confirme a ementa antes de criar tópicos.",
  SYLLABUS_ITEM_NOT_IN_PLAN: "Este item não existe na versão da ementa usada agora.",
  PLAN_HAS_NO_TOPICS: "Crie ao menos um tópico antes de confirmar.",
  TOO_MANY_TOPICS: "O planejamento pode ter no máximo 300 tópicos.",
  MEETING_NOT_HELD_YET: "Só é possível concluir uma aula a partir da data dela.",
  RATE_LIMITED: "Muitas tentativas. Tente novamente mais tarde.",
  INTERNAL_ERROR: "Erro interno. Tente novamente mais tarde.",
  [NETWORK_ERROR]: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
  [UNEXPECTED_RESPONSE]: "Erro inesperado. Tente novamente mais tarde.",
} as const satisfies Record<ErrorCode | ClientErrorCode, string>;

const isKnownCode = (code: string): code is keyof typeof ERROR_MESSAGES => Object.hasOwn(ERROR_MESSAGES, code);

/**
 * Text to show for any failure: the catalogue entry for the error's code, never the API's
 * `message`. `RATE_LIMITED` with `Retry-After` says how many minutes to wait; an unknown code
 * (an API newer than this web) or a non-API error gets the generic text.
 */
export function messageForError(error: unknown): string {
  if (!(error instanceof ApiError)) return ERROR_MESSAGES[UNEXPECTED_RESPONSE];
  if (error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
    const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
    return `Muitas tentativas. Tente novamente em ${minutes} minuto${minutes > 1 ? "s" : ""}.`;
  }
  return isKnownCode(error.code) ? ERROR_MESSAGES[error.code] : ERROR_MESSAGES[UNEXPECTED_RESPONSE];
}

/**
 * Code of an API answer (`WEAK_PASSWORD`, `TOKEN_INVALID`…), for screens that point an error at a
 * field or change step; undefined for anything that is not an `ApiError`. Components use this
 * instead of importing `lib/api` (FR-025).
 */
export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}
