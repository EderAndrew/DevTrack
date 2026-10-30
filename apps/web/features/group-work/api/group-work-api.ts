import type { GroupCandidates } from "@repo/contracts";
import { ApiError, apiClient } from "@/lib/api/client";

/** The student's group routes (023 contracts/http-api.md); identity from the session only. */
export const groupWorkApi = {
  /** The classmates the caller may choose (FR-005), by name, with the slots left. */
  candidates: (activityId: string) => apiClient.get<GroupCandidates>(`/me/activities/${activityId}/group/candidates`),
};

/** The ids a `409 GROUP_MEMBERS_UNAVAILABLE` names (research U6); empty for any other failure. */
export function unavailableIds(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== "GROUP_MEMBERS_UNAVAILABLE") return [];
  return error.details && "unavailableIds" in error.details ? error.details.unavailableIds : [];
}
