import { cookies } from "next/headers";
import { ApiError, apiClient } from "./api-client";
import type { SessionView } from "./auth-api";

/** `GET /api/me` (contracts/http-api.md). `permissions` drive UX only; the API authorizes. */
export interface MeView {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  roles: { key: string; status: "ACTIVE" | "SUSPENDED" | "INACTIVE" }[];
  permissions: string[];
}

/** Server-side base URL of the API (the rewrite only exists for browser requests). */
export function serverApiBaseUrl(): string {
  return `${(process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "")}/api`;
}

/**
 * Current user for Server Components, forwarding the request's cookie to the API (R18).
 * Returns null when there is no valid session; any other failure propagates.
 */
export async function getMe(): Promise<MeView | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  try {
    return await apiClient.get<MeView>("/me", { baseUrl: serverApiBaseUrl(), cookie });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Own active sessions for Server Components; null when there is no valid session. */
export async function getOwnSessions(): Promise<SessionView[] | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  try {
    const { items } = await apiClient.get<{ items: SessionView[] }>("/me/sessions", {
      baseUrl: serverApiBaseUrl(),
      cookie,
    });
    return items;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
