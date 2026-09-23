"use client";

import type { ClassListQuery, ClassStatus, ClassView, CreateClassRequest, UpdateClassRequest } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { classesApi } from "../api/classes";

/** Filters of the classes list (the cursor is handled by the infinite query). */
export type ClassFilters = Omit<ClassListQuery, "cursor">;

/** Query keys of 003 contracts/web-ui.md: `["classes", filters]` and `["classes", id]`. */
export const classesKeys = {
  all: ["classes"] as const,
  list: (filters: ClassFilters) => [...classesKeys.all, filters] as const,
  detail: (id: string) => [...classesKeys.all, id] as const,
};

/** The teacher's classes for `filters`, page by page ("Carregar mais"); the server searches and filters. */
export const useClasses = (filters: ClassFilters) =>
  useInfiniteQuery({
    queryKey: classesKeys.list(filters),
    queryFn: ({ pageParam }) => classesApi.list({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

export const useClass = (id: string) =>
  useQuery({ queryKey: classesKeys.detail(id), queryFn: () => classesApi.get(id) });

/** After a create, edit or status change: the returned class is cached and every classes query is stale. */
function useAfterChange() {
  const queryClient = useQueryClient();
  return async (updated: ClassView) => {
    await queryClient.invalidateQueries({ queryKey: classesKeys.all });
    queryClient.setQueryData(classesKeys.detail(updated.id), updated);
  };
}

export function useCreateClass() {
  const afterChange = useAfterChange();
  return useMutation({ mutationFn: (body: CreateClassRequest) => classesApi.create(body), onSuccess: afterChange });
}

export function useUpdateClass(id: string) {
  const afterChange = useAfterChange();
  return useMutation({ mutationFn: (body: UpdateClassRequest) => classesApi.update(id, body), onSuccess: afterChange });
}

export function useChangeClassStatus(id: string) {
  const afterChange = useAfterChange();
  return useMutation({ mutationFn: (status: ClassStatus) => classesApi.changeStatus(id, status), onSuccess: afterChange });
}
