"use client";

import type { AdminFeedback, ChangeFeedbackStatusRequest } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFeedbackApi } from "../api/feedback-api";
import type { AdminFeedbackFilters } from "../schemas/admin-feedback";
import { feedbackKeys } from "./use-send-feedback";

/** Query keys of the ADMIN side: `["feedback", "admin", …]` for the lists and details, `["feedback", "summary"]` for the badge. */
export const adminFeedbackKeys = {
  all: [...feedbackKeys.all, "admin"] as const,
  list: (filters: AdminFeedbackFilters) => [...adminFeedbackKeys.all, "list", filters] as const,
  detail: (id: string) => [...adminFeedbackKeys.all, id] as const,
  summary: [...feedbackKeys.all, "summary"] as const,
};

/** Newest first, 50 at a time ("Carregar mais"); the server filters. */
export const useAdminFeedbacks = (filters: AdminFeedbackFilters) =>
  useInfiniteQuery({
    queryKey: adminFeedbackKeys.list(filters),
    queryFn: ({ pageParam }) => adminFeedbackApi.list({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

export const useAdminFeedback = (id: string) => useQuery({ queryKey: adminFeedbackKeys.detail(id), queryFn: () => adminFeedbackApi.get(id) });

/**
 * The menu badge: refetched when the window regains focus and after a status change (invalidation),
 * never by polling (research J7).
 */
export const useFeedbackSummary = (enabled: boolean) =>
  useQuery({ queryKey: adminFeedbackKeys.summary, queryFn: () => adminFeedbackApi.summary(), enabled, refetchOnWindowFocus: true });

/** "Mudar situação": the returned feedback is cached; the lists and the badge go stale. */
export function useChangeFeedbackStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeFeedbackStatusRequest) => adminFeedbackApi.changeStatus(id, body),
    onSuccess: async (updated: AdminFeedback) => {
      queryClient.setQueryData(adminFeedbackKeys.detail(id), updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...adminFeedbackKeys.all, "list"] }),
        queryClient.invalidateQueries({ queryKey: adminFeedbackKeys.summary }),
      ]);
    },
  });
}
