import { ApiError, apiClient } from "./api-client";
import type { MeView } from "./session";

/** Public account endpoints of contracts/http-api.md. The API validates and decides; this only calls it. */
export interface PublicAccepted {
  message: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

/** `SessionView` of contracts/http-api.md (dates as ISO strings). */
export interface SessionView {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export type AcceptanceMode = "CREATE_ACCOUNT" | "SIGN_IN_REQUIRED" | "CLAIM_ACCOUNT";

export interface AdminActivationPreview {
  email: string;
  mode: AcceptanceMode;
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
  /** Sends exactly `{email, password}`; the session cookie is set by the API. */
  login: (email: string, password: string) => apiClient.post<{ user: MeView }>("/auth/login", { email, password }),
  logout: () => apiClient.post<void>("/auth/logout"),
  logoutAll: () => apiClient.post<void>("/auth/logout-all"),
  listSessions: () => apiClient.get<{ items: SessionView[] }>("/me/sessions"),
  previewAdminActivation: (token: string) =>
    apiClient.post<AdminActivationPreview>("/admin-activation/preview", { token }),
  /** `password` only for CREATE_ACCOUNT/CLAIM_ACCOUNT; SIGN_IN_REQUIRED relies on the session. */
  activateAdmin: (token: string, password?: string) =>
    apiClient.post<{ role: "ADMIN" }>("/admin-activation", password === undefined ? { token } : { token, password }),
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
