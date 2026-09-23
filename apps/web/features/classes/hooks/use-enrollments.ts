"use client";

import type { EnrollmentListQuery } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { enrollmentsApi } from "../api/enrollments";
import { classesKeys } from "./use-classes";

/** Filters of the students list (the cursor is handled by the infinite query). */
export type EnrollmentFilters = Omit<EnrollmentListQuery, "cursor">;

/** Query keys of 003 contracts/web-ui.md: `["classes", id, "enrollments", filters]`. */
export const enrollmentsKeys = {
  all: (classId: string) => [...classesKeys.detail(classId), "enrollments"] as const,
  list: (classId: string, filters: EnrollmentFilters) => [...enrollmentsKeys.all(classId), filters] as const,
};

/** Students of the class for `filters`, page by page ("Carregar mais"); the server searches and filters. */
export const useEnrollments = (classId: string, filters: EnrollmentFilters) =>
  useInfiniteQuery({
    queryKey: enrollmentsKeys.list(classId, filters),
    queryFn: ({ pageParam }) => enrollmentsApi.list(classId, { ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

/**
 * Removes a student (FR-044). `["classes", id]` is a prefix of the class's lists, so the class
 * (its active student count) and its enrollments are both refetched.
 */
export function useRemoveEnrollment(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) => enrollmentsApi.remove(classId, enrollmentId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: classesKeys.detail(classId) }),
  });
}
