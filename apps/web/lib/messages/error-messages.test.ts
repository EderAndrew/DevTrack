import { ErrorCodeSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { ApiError, NETWORK_ERROR, UNEXPECTED_RESPONSE } from "../api/client";
import { apiErrorCode, ERROR_MESSAGES, messageForError } from "./error-messages";

// Phase 001 texts, copied literally from the API's ErrorCatalog and the web's generic messages:
// moving the texts into the web must not change a single character on screen (FR-012, FR-013).
const PHASE_001_TEXTS = {
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
};

const apiError = (code: string, retryAfterSeconds: number | null = null) =>
  new ApiError(400, code, "texto enviado pela API", retryAfterSeconds);

describe("002/US2-3 catálogo de mensagens de erro do web (002/SC-004)", () => {
  it("cobre os 24 códigos do contrato e os 2 códigos do web, com os textos da Fase 001", () => {
    expect(ERROR_MESSAGES).toEqual(PHASE_001_TEXTS);
    expect(Object.keys(ERROR_MESSAGES)).toEqual(expect.arrayContaining(ErrorCodeSchema.options));
    expect(Object.keys(ERROR_MESSAGES)).toHaveLength(26);
  });

  it.each(Object.entries(PHASE_001_TEXTS))("%s → texto do catálogo, não o message da API", (code, text) => {
    expect(messageForError(apiError(code))).toBe(text);
  });

  it("código desconhecido e erro que não é ApiError → texto de UNEXPECTED_RESPONSE", () => {
    expect(messageForError(apiError("SOME_FUTURE_CODE"))).toBe(PHASE_001_TEXTS[UNEXPECTED_RESPONSE]);
    expect(messageForError(new Error("boom"))).toBe(PHASE_001_TEXTS[UNEXPECTED_RESPONSE]);
    expect(messageForError("boom")).toBe(PHASE_001_TEXTS[UNEXPECTED_RESPONSE]);
  });

  it.each([
    [30, "Muitas tentativas. Tente novamente em 1 minuto."],
    [60, "Muitas tentativas. Tente novamente em 1 minuto."],
    [61, "Muitas tentativas. Tente novamente em 2 minutos."],
    [900, "Muitas tentativas. Tente novamente em 15 minutos."],
  ])("RATE_LIMITED com Retry-After de %i s → %s", (seconds, text) => {
    expect(messageForError(apiError("RATE_LIMITED", seconds))).toBe(text);
  });

  it("RATE_LIMITED sem Retry-After → texto do catálogo", () => {
    expect(messageForError(apiError("RATE_LIMITED"))).toBe(PHASE_001_TEXTS.RATE_LIMITED);
    expect(messageForError(apiError("RATE_LIMITED", 0))).toBe(PHASE_001_TEXTS.RATE_LIMITED);
  });
});

describe("apiErrorCode", () => {
  it("devolve o código de um ApiError e undefined para o resto", () => {
    expect(apiErrorCode(new ApiError(400, "WEAK_PASSWORD", "x"))).toBe("WEAK_PASSWORD");
    expect(apiErrorCode(new Error("x"))).toBeUndefined();
    expect(apiErrorCode(undefined)).toBeUndefined();
  });
});
