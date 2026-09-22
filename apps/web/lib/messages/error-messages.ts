import type { ErrorCode } from "@repo/contracts";
import { ApiError, NETWORK_ERROR, UNEXPECTED_RESPONSE } from "../api-client";

type ClientErrorCode = typeof NETWORK_ERROR | typeof UNEXPECTED_RESPONSE;

/**
 * User-facing text for every error code: the contract's codes plus the web's own (002 S8, FR-013).
 * The texts belong to the web, not to the API's `message`; they are the Phase 001 texts (FR-012).
 */
export const ERROR_MESSAGES = {
  VALIDATION_ERROR: "Dados inválidos.",
  WEAK_PASSWORD: "A senha deve ter entre 12 e 128 caracteres e não pode ser uma senha comum.",
  PASSWORD_REQUIRED: "Defina uma senha para continuar.",
  TOKEN_INVALID: "Link inválido ou expirado.",
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
