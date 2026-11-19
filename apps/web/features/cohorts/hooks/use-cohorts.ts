"use client";

import type { CohortListQuery, CohortStatus, CreateCohortRequest, UpdateCohortRequest } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cohortsApi } from "../api/cohorts";

/** Filters of the turmas list (the cursor is handled by the infinite query). */
export type CohortFilters = Omit<CohortListQuery, "cursor" | "limit">;

/** Query keys: `["cohorts", filters]` for the lists and `["cohorts", id]` for a turma's page. */
export const cohortsKeys = {
  all: ["cohorts"] as const,
  list: (filters: CohortFilters) => [...cohortsKeys.all, filters] as const,
  detail: (id: string) => [...cohortsKeys.all, id] as const,
};

/** Every turma for `filters`, page by page ("Carregar mais"); the server searches and filters (027/FR-006). */
export const useCohorts = (filters: CohortFilters) =>
  useInfiniteQuery({
    queryKey: cohortsKeys.list(filters),
    queryFn: ({ pageParam }) => cohortsApi.list({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

export const useCohort = (id: string) => useQuery({ queryKey: cohortsKeys.detail(id), queryFn: () => cohortsApi.get(id) });

/** After a create, edit or status change every turma query is stale (the page reads its disciplinas again). */
function useAfterChange() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: cohortsKeys.all });
}

export function useCreateCohort() {
  const afterChange = useAfterChange();
  return useMutation({ mutationFn: (body: CreateCohortRequest) => cohortsApi.create(body), onSuccess: afterChange });
}

export function useUpdateCohort(id: string) {
  const afterChange = useAfterChange();
  return useMutation({ mutationFn: (body: UpdateCohortRequest) => cohortsApi.update(id, body), onSuccess: afterChange });
}

export function useChangeCohortStatus(id: string) {
  const afterChange = useAfterChange();
  return useMutation({ mutationFn: (to: CohortStatus) => cohortsApi.changeStatus(id, to), onSuccess: afterChange });
}
