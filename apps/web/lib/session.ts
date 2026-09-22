import type { MeView, SessionListResponse, SessionView } from "@repo/contracts";
import { serverApiBaseUrl, serverGet } from "./server-api";

export { serverApiBaseUrl };

export type { MeView } from "@repo/contracts";

/** Current user (`GET /api/me`) for Server Components; null when there is no valid session. `permissions` drive UX only. */
export function getMe(): Promise<MeView | null> {
  return serverGet<MeView>("/me");
}

/** Own active sessions for Server Components; null when there is no valid session. */
export async function getOwnSessions(): Promise<SessionView[] | null> {
  const page = await serverGet<SessionListResponse>("/me/sessions");
  return page?.items ?? null;
}
