import type { SessionView } from "./auth-api";
import { serverApiBaseUrl, serverGet } from "./server-api";

export { serverApiBaseUrl };

/** `GET /api/me` (contracts/http-api.md). `permissions` drive UX only; the API authorizes. */
export interface MeView {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  roles: { key: string; status: "ACTIVE" | "SUSPENDED" | "INACTIVE" }[];
  permissions: string[];
}

/** Current user for Server Components; null when there is no valid session. */
export function getMe(): Promise<MeView | null> {
  return serverGet<MeView>("/me");
}

/** Own active sessions for Server Components; null when there is no valid session. */
export async function getOwnSessions(): Promise<SessionView[] | null> {
  const page = await serverGet<{ items: SessionView[] }>("/me/sessions");
  return page?.items ?? null;
}
