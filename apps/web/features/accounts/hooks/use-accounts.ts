"use client";

import type { AccountPage, UserAccountView } from "@repo/contracts";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { accountsApi } from "../api/accounts";

export const accountsKeys = {
  all: ["accounts"] as const,
  lists: () => [...accountsKeys.all, "list"] as const,
  /** One page of a search: `cursor` null is the first page. */
  list: (query: string, cursor: string | null) => [...accountsKeys.lists(), query, cursor] as const,
  detail: (id: string) => [...accountsKeys.all, "detail", id] as const,
};

const fetchPage = (query: string, cursor: string | null) =>
  accountsApi.list({ query: query || undefined, cursor: cursor ?? undefined });

/**
 * The pages loaded so far for `query`, in order (`cursors` starts with null). The first page of
 * the empty search starts from what the page read on the server.
 */
export function useAccountPages(query: string, cursors: readonly (string | null)[], initialPage: AccountPage) {
  return useQueries({
    queries: cursors.map((cursor) => ({
      queryKey: accountsKeys.list(query, cursor),
      queryFn: () => fetchPage(query, cursor),
      initialData: query === "" && cursor === null ? initialPage : undefined,
    })),
  });
}

/** Loads a page into the cache on demand (search, "Carregar mais"); a new search always asks the API. */
export function useLoadAccountPage() {
  const queryClient = useQueryClient();
  return (query: string, cursor: string | null) =>
    queryClient.fetchQuery({ queryKey: accountsKeys.list(query, cursor), queryFn: () => fetchPage(query, cursor), staleTime: 0 });
}

/**
 * Suspends an ACTIVE account or reactivates a SUSPENDED one. The returned account replaces the
 * row in every loaded page and the lists are marked stale, without an extra request.
 */
export function useToggleAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (account: UserAccountView) =>
      account.status === "SUSPENDED" ? accountsApi.reactivate(account.id) : accountsApi.suspend(account.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(accountsKeys.detail(updated.id), updated);
      queryClient.setQueriesData<AccountPage>({ queryKey: accountsKeys.lists() }, (page) =>
        page ? { ...page, items: page.items.map((item) => (item.id === updated.id ? updated : item)) } : page,
      );
      return queryClient.invalidateQueries({ queryKey: accountsKeys.lists(), refetchType: "none" });
    },
  });
}
