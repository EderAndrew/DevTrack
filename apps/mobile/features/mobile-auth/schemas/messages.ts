import { ApiError, NETWORK_ERROR, UNEXPECTED_RESPONSE } from "../../../lib/api/client";

/**
 * The app's words for the API codes it can get (024 contracts/mobile-ui.md): the web's texts
 * (apps/web/lib/messages/error-messages.ts) for the shared ones, and the app's own refusal.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
  ACCOUNT_SUSPENDED: "Esta conta está suspensa.",
  MOBILE_NOT_ALLOWED: "Este aplicativo é para professores acompanharem provas.",
  VALIDATION_ERROR: "Dados inválidos.",
  RATE_LIMITED: "Muitas tentativas. Tente novamente mais tarde.",
  NOT_FOUND: "Esta prova não está mais disponível.",
  [NETWORK_ERROR]: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
  [UNEXPECTED_RESPONSE]: "Erro inesperado. Tente novamente mais tarde.",
};

export const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre novamente para voltar a receber avisos.";

export function messageForError(error: unknown): string {
  if (!(error instanceof ApiError)) return ERROR_MESSAGES[UNEXPECTED_RESPONSE]!;
  if (error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
    const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
    return `Muitas tentativas. Tente novamente em ${minutes} minuto${minutes > 1 ? "s" : ""}.`;
  }
  return ERROR_MESSAGES[error.code] ?? ERROR_MESSAGES[UNEXPECTED_RESPONSE]!;
}
