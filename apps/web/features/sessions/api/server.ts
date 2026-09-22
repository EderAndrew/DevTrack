import type { SessionListResponse } from "@repo/contracts";
import { serverGet } from "@/lib/api/server";

/** Own active sessions for the page's first render; null when there is no valid session. */
export function fetchOwnSessions(): Promise<SessionListResponse | null> {
  return serverGet<SessionListResponse>("/me/sessions");
}
