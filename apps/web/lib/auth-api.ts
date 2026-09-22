import type {
  AdminActivated,
  AdminActivationPreview,
  AdminActivationRequest,
  EmailVerifiedResponse,
  LoginRequest,
  LoginResponse,
  MessageResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  PublicAccepted,
  ResendVerificationRequest,
  SessionListResponse,
  SignupRequest,
  TokenRequest,
  VerifyEmailRequest,
} from "@repo/contracts";
import { apiClient } from "./api-client";

/** Types of @repo/contracts still imported from here by the screens (moved to features/ in US4). */
export type { AdminActivationPreview, SessionView } from "@repo/contracts";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Password length in characters as the API counts it (code points), for UX hints only. */
export const passwordLength = (password: string) => [...password].length;

/**
 * Public account endpoints of @repo/contracts. The API validates and decides; this only calls it.
 * Every body `satisfies` its request contract, so a contract change breaks the type-check here (SC-003).
 */
export const authApi = {
  /** Sends exactly `{name, email, password}`: extra fields are rejected by the API (FR-010). */
  signup: ({ name, email, password }: SignupRequest) =>
    apiClient.post<PublicAccepted>("/auth/signup", { name, email, password } satisfies SignupRequest),
  verifyEmail: (token: string) => apiClient.post<EmailVerifiedResponse>("/auth/verify-email", { token } satisfies VerifyEmailRequest),
  resendVerification: (email: string) => apiClient.post<PublicAccepted>("/auth/verify-email/resend", { email } satisfies ResendVerificationRequest),
  /** Sends exactly `{email, password}`; the session cookie is set by the API. */
  requestPasswordReset: (email: string) => apiClient.post<PublicAccepted>("/auth/password-reset/request", { email } satisfies PasswordResetRequest),
  confirmPasswordReset: (token: string, password: string) =>
    apiClient.post<MessageResponse>("/auth/password-reset/confirm", { token, password } satisfies PasswordResetConfirmRequest),
  login: (email: string, password: string) => apiClient.post<LoginResponse>("/auth/login", { email, password } satisfies LoginRequest),
  logout: () => apiClient.post<void>("/auth/logout"),
  logoutAll: () => apiClient.post<void>("/auth/logout-all"),
  listSessions: () => apiClient.get<SessionListResponse>("/me/sessions"),
  previewAdminActivation: (token: string) =>
    apiClient.post<AdminActivationPreview>("/admin-activation/preview", { token } satisfies TokenRequest),
  /** `password` only for CREATE_ACCOUNT/CLAIM_ACCOUNT; SIGN_IN_REQUIRED relies on the session. */
  activateAdmin: (token: string, password?: string) =>
    apiClient.post<AdminActivated>(
      "/admin-activation",
      (password === undefined ? { token } : { token, password }) satisfies AdminActivationRequest,
    ),
  revokeSession: (id: string) => apiClient.delete<void>(`/me/sessions/${encodeURIComponent(id)}`),
};

/**
 * Post-login destination: only a path of this app (`/…`), never `//host` or `/\host`, so a
 * crafted `?next=` cannot send the user to another site. Defaults to the sessions page.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/conta/sessoes"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** User-facing text for a failure, from the web's own catalogue (002 S8); kept here for the screens' imports. */
export { messageForError as errorMessage } from "./messages/error-messages";
