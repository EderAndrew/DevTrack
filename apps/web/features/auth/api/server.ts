import type { MeView } from "@repo/contracts";
import { serverGet } from "@/lib/api/server";

/**
 * Current user (`GET /api/me`) for Server Components; null when there is no valid session.
 * `permissions` drive UX only. Imported by `app/` only (uses next/headers).
 */
export function getMe(): Promise<MeView | null> {
  return serverGet<MeView>("/me");
}
