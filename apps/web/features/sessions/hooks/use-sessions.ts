"use client";

import type { SessionListResponse, SessionView } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionsApi } from "../api/sessions";

export const sessionsKeys = {
  all: ["sessions"] as const,
  list: () => [...sessionsKeys.all, "list"] as const,
};

/** Own sessions, starting from what the page read on the server (002 S10). */
export const useOwnSessions = (initialData: SessionListResponse) =>
  useQuery({ queryKey: sessionsKeys.list(), queryFn: sessionsApi.list, initialData });

/**
 * Revokes one session. Another session leaves the list at once; the list is marked stale
 * without an extra request, as the Phase 001 screen did. Revoking the current one ends this
 * session: the caller navigates away and nothing is kept.
 */
export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (session: SessionView) => sessionsApi.revoke(session.id),
    onSuccess: (_, session) => {
      if (session.current) {
        queryClient.clear();
        return;
      }
      queryClient.setQueryData<SessionListResponse>(sessionsKeys.list(), (page) =>
        page ? { items: page.items.filter((item) => item.id !== session.id) } : page,
      );
      return queryClient.invalidateQueries({ queryKey: sessionsKeys.list(), refetchType: "none" });
    },
  });
}
