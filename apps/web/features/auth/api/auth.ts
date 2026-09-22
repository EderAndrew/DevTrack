import type {
  EmailVerifiedResponse,
  LoginRequest,
  LoginResponse,
  MessageResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  PublicAccepted,
  ResendVerificationRequest,
  SignupRequest,
  VerifyEmailRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/**
 * Public account endpoints of @repo/contracts. The API validates and decides; this only calls it.
 * Every body `satisfies` its request contract, so a contract change breaks the type-check here (SC-003).
 */
export const authApi = {
  /** Sends exactly `{name, email, password}`: extra fields are rejected by the API (FR-010). */
  signup: ({ name, email, password }: SignupRequest) =>
    apiClient.post<PublicAccepted>("/auth/signup", { name, email, password } satisfies SignupRequest),
  verifyEmail: (token: string) =>
    apiClient.post<EmailVerifiedResponse>("/auth/verify-email", { token } satisfies VerifyEmailRequest),
  resendVerification: ({ email }: ResendVerificationRequest) =>
    apiClient.post<PublicAccepted>("/auth/verify-email/resend", { email } satisfies ResendVerificationRequest),
  requestPasswordReset: ({ email }: PasswordResetRequest) =>
    apiClient.post<PublicAccepted>("/auth/password-reset/request", { email } satisfies PasswordResetRequest),
  confirmPasswordReset: ({ token, password }: PasswordResetConfirmRequest) =>
    apiClient.post<MessageResponse>("/auth/password-reset/confirm", { token, password } satisfies PasswordResetConfirmRequest),
  /** Sends exactly `{email, password}`; the session cookie is set by the API. */
  login: ({ email, password }: LoginRequest) =>
    apiClient.post<LoginResponse>("/auth/login", { email, password } satisfies LoginRequest),
  logout: () => apiClient.post<void>("/auth/logout"),
  logoutAll: () => apiClient.post<void>("/auth/logout-all"),
};
