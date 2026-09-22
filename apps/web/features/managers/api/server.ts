import type { InvitationListResponse, ManagerListResponse } from "@repo/contracts";
import { serverGet } from "@/lib/api/server";

/** Managers and their invitations for the page's first render; null when there is no valid session. */
export async function fetchManagersPage(): Promise<{
  managers: ManagerListResponse;
  invitations: InvitationListResponse;
} | null> {
  const [managers, invitations] = await Promise.all([
    serverGet<ManagerListResponse>("/managers"),
    serverGet<InvitationListResponse>("/manager-invitations"),
  ]);
  return managers && invitations ? { managers, invitations } : null;
}
