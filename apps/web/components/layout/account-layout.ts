import type { MeView } from "@repo/contracts";
import { STAFF_AREA_PERMISSIONS } from "@/lib/navigation";

export type AccountLayout = "app-shell" | "student";

/**
 * Frame of the account screens (profile, sessions): the AppShell for a verified user with any
 * teacher or administration area of the menu, otherwise the student layout (005 FR-024, US5-3).
 * UX only: the API authorizes every request.
 */
export function accountLayoutFor(me: Pick<MeView, "emailVerified" | "permissions"> | null): AccountLayout {
  const staff = Boolean(me?.emailVerified && me.permissions.some((p) => STAFF_AREA_PERMISSIONS.includes(p)));
  return staff ? "app-shell" : "student";
}
