"use client";

import type {
  CreateSubjectRequest,
  SubjectListQuery,
  SubjectStatus,
  SubjectView,
  UpdateSubjectRequest,
} from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { classesKeys } from "@/features/classes/hooks/use-classes";
import { subjectsApi } from "../api/subjects";

/** Filters of the subjects list (the cursor is handled by the infinite query). */
export type SubjectFilters = Omit<SubjectListQuery, "cursor">;

/** Query keys: `["subjects", filters]` and `["subjects", id]`. */
export const subjectsKeys = {
  all: ["subjects"] as const,
  list: (filters: SubjectFilters) => [...subjectsKeys.all, filters] as const,
  detail: (id: string) => [...subjectsKeys.all, id] as const,
};

/** The teacher's subjects for `filters`, page by page ("Carregar mais"); the server searches and filters. */
export const useSubjects = (filters: SubjectFilters) =>
  useInfiniteQuery({
    queryKey: subjectsKeys.list(filters),
    queryFn: ({ pageParam }) => subjectsApi.list({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

export const useSubject = (id: string) =>
  useQuery({ queryKey: subjectsKeys.detail(id), queryFn: () => subjectsApi.get(id) });

/**
 * After a create, edit or status change: the returned subject is cached and every subjects
 * query is stale; so are the classes, which show the subject's name.
 */
function useAfterChange() {
  const queryClient = useQueryClient();
  return async (updated: SubjectView) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: subjectsKeys.all }),
      queryClient.invalidateQueries({ queryKey: classesKeys.all }),
    ]);
    queryClient.setQueryData(subjectsKeys.detail(updated.id), updated);
  };
}

export function useCreateSubject() {
  const afterChange = useAfterChange();
  return useMutation({ mutationFn: (body: CreateSubjectRequest) => subjectsApi.create(body), onSuccess: afterChange });
}

export function useUpdateSubject(id: string) {
  const afterChange = useAfterChange();
  return useMutation({
    mutationFn: (body: UpdateSubjectRequest) => subjectsApi.update(id, body),
    onSuccess: afterChange,
  });
}

export function useChangeSubjectStatus(id: string) {
  const afterChange = useAfterChange();
  return useMutation({
    mutationFn: (status: SubjectStatus) => subjectsApi.changeStatus(id, status),
    onSuccess: afterChange,
  });
}
