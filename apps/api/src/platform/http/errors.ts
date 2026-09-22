import type { ErrorBody, ErrorCode } from "@repo/contracts";

/**
 * Error catalogue of contracts/http-api.md. Every error leaving the API has the shape
 * {statusCode, code, message}; messages are pt-BR and never carry data about the target.
 */
export const ErrorCatalog = {
  VALIDATION_ERROR: { status: 400, message: "Dados inválidos." },
  WEAK_PASSWORD: {
    status: 400,
    message: "A senha deve ter entre 12 e 128 caracteres e não pode ser uma senha comum.",
  },
  PASSWORD_REQUIRED: { status: 400, message: "Defina uma senha para continuar." },
  TOKEN_INVALID: { status: 400, message: "Link inválido ou expirado." },
  UNAUTHENTICATED: { status: 401, message: "Autenticação necessária." },
  INVALID_CREDENTIALS: { status: 401, message: "E-mail ou senha incorretos." },
  SIGN_IN_REQUIRED: { status: 401, message: "Entre na sua conta para continuar." },
  FORBIDDEN: { status: 403, message: "Você não possui permissão para esta operação." },
  EMAIL_NOT_VERIFIED: { status: 403, message: "Verifique seu e-mail para continuar." },
  ACCOUNT_SUSPENDED: { status: 403, message: "Esta conta está suspensa." },
  WRONG_ACCOUNT: {
    status: 403,
    message: "Você está conectado em outra conta. Entre com a conta do e-mail convidado.",
  },
  SELF_INVITE_FORBIDDEN: { status: 403, message: "Não é possível convidar a si mesmo." },
  SELF_ACTION_FORBIDDEN: { status: 403, message: "Não é possível executar esta operação sobre a própria conta." },
  ORIGIN_NOT_ALLOWED: { status: 403, message: "Origem da requisição não permitida." },
  NOT_FOUND: { status: 404, message: "Recurso não encontrado." },
  INVALID_STATE_TRANSITION: { status: 409, message: "Operação não permitida no estado atual." },
  ALREADY_TEACHER: { status: 409, message: "Esta pessoa já é professor." },
  ALREADY_MANAGER: { status: 409, message: "Esta pessoa já é gestor de cadastros." },
  TEACHER_REACTIVATION_REQUIRED: {
    status: 409,
    message: "O papel de professor desta pessoa está suspenso ou inativo. Use a reativação.",
  },
  INVITATION_ALREADY_PENDING: {
    status: 409,
    message: "Já existe um convite pendente para este e-mail. Reenvie o convite existente.",
  },
  LAST_ADMIN_PROTECTED: { status: 409, message: "Não é possível remover o último administrador ativo." },
  BOOTSTRAP_ALREADY_DONE: { status: 409, message: "Bootstrap administrativo já realizado." },
  RATE_LIMITED: { status: 429, message: "Muitas tentativas. Tente novamente mais tarde." },
  INTERNAL_ERROR: { status: 500, message: "Erro interno. Tente novamente mais tarde." },
} as const satisfies Record<ErrorCode, { status: number; message: string }>;

export class AppException extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string = ErrorCatalog[code].message,
    /** Extra response headers, e.g. Retry-After for RATE_LIMITED. */
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "AppException";
    this.status = ErrorCatalog[code].status;
  }

  toBody(): ErrorBody {
    return { statusCode: this.status, code: this.code, message: this.message };
  }
}

export const validationError = () => new AppException("VALIDATION_ERROR");
export const weakPassword = () => new AppException("WEAK_PASSWORD");
export const passwordRequired = () => new AppException("PASSWORD_REQUIRED");
export const tokenInvalid = () => new AppException("TOKEN_INVALID");
export const unauthenticated = () => new AppException("UNAUTHENTICATED");
export const invalidCredentials = () => new AppException("INVALID_CREDENTIALS");
export const signInRequired = () => new AppException("SIGN_IN_REQUIRED");
export const forbidden = () => new AppException("FORBIDDEN");
export const emailNotVerified = () => new AppException("EMAIL_NOT_VERIFIED");
export const accountSuspended = () => new AppException("ACCOUNT_SUSPENDED");
export const wrongAccount = () => new AppException("WRONG_ACCOUNT");
export const selfInviteForbidden = () => new AppException("SELF_INVITE_FORBIDDEN");
export const selfActionForbidden = () => new AppException("SELF_ACTION_FORBIDDEN");
export const originNotAllowed = () => new AppException("ORIGIN_NOT_ALLOWED");
export const notFound = () => new AppException("NOT_FOUND");
export const invalidStateTransition = () => new AppException("INVALID_STATE_TRANSITION");
export const alreadyTeacher = () => new AppException("ALREADY_TEACHER");
export const alreadyManager = () => new AppException("ALREADY_MANAGER");
export const teacherReactivationRequired = () => new AppException("TEACHER_REACTIVATION_REQUIRED");
export const invitationAlreadyPending = () => new AppException("INVITATION_ALREADY_PENDING");
export const lastAdminProtected = () => new AppException("LAST_ADMIN_PROTECTED");
export const bootstrapAlreadyDone = () => new AppException("BOOTSTRAP_ALREADY_DONE");
export const rateLimited = (retryAfterSeconds: number) =>
  new AppException("RATE_LIMITED", undefined, {
    "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
  });
