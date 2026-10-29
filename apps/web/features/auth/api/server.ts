import type { MeView } from "@repo/contracts";
import { cache } from "react";
import { serverGet } from "@/lib/api/server";

/**
 * Current user (`GET /api/me`) for Server Components; null when there is no valid session.
 * `permissions` drive UX only. Imported by `app/` only (uses next/headers). One request per
 * render, shared by the root layout (022: the theme), the group layouts and the page.
 */
export const getMe = cache((): Promise<MeView | null> => serverGet<MeView>("/me"));

/** For navigation (header, side menu) only: any failure shows the signed-out navigation. */
export async function getMeForNavigation(): Promise<MeView | null> {
  try {
    return await getMe();
  } catch {
    return null;
  }
}
