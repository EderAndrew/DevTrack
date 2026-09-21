import { ApiError, apiClient } from "./api-client";

/** Public account endpoints of contracts/http-api.md. The API validates and decides; this only calls it. */
export interface PublicAccepted {
  message: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Password length in characters as the API counts it (code points), for UX hints only. */
export const passwordLength = (password: string) => [...password].length;

export const authApi = {
  /** Sends exactly `{name, email, password}`: extra fields are rejected by the API (FR-010). */
  signup: ({ name, email, password }: SignupInput) =>
    apiClient.post<PublicAccepted>("/auth/signup", { name, email, password }),
  verifyEmail: (token: string) => apiClient.post<{ emailVerified: true }>("/auth/verify-email", { token }),
  resendVerification: (email: string) => apiClient.post<PublicAccepted>("/auth/verify-email/resend", { email }),
};

/** User-facing text for an API failure; API messages are already generic and in Portuguese. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
      const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      return `Muitas tentativas. Tente novamente em ${minutes} minuto${minutes > 1 ? "s" : ""}.`;
    }
    return error.message;
  }
  return "Erro inesperado. Tente novamente mais tarde.";
}
