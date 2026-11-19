"use client";

import type { EnrollmentListQuery } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cohortEnrollmentsApi } from "../api/cohort-enrollments";
import { cohortsKeys } from "./use-cohorts";

export type CohortEnrollmentFilters = Omit<EnrollmentListQuery, "cursor">;

export const cohortEnrollmentsKeys = {
  all: (cohortId: string) => [...cohortsKeys.detail(cohortId), "enrollments"] as const,
  list: (cohortId: string, filters: CohortEnrollmentFilters) => [...cohortEnrollmentsKeys.all(cohortId), filters] as const,
};

/** The turma's students, 20 at a time ("Carregar mais"). */
export const useCohortEnrollments = (cohortId: string, filters: CohortEnrollmentFilters = {}) =>
  useInfiniteQuery({
    queryKey: cohortEnrollmentsKeys.list(cohortId, filters),
    queryFn: ({ pageParam }) => cohortEnrollmentsApi.list(cohortId, { ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

/** The lookup by exact e-mail; a mutation, since it is a POST that the server limits and audits. */
export const useStudentLookup = (cohortId: string) =>
  useMutation({ mutationFn: (email: string) => cohortEnrollmentsApi.lookup(cohortId, email) });

/** The direct enrollment; the turma (its count) and its student list become stale. */
export function useEnrollStudent(cohortId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => cohortEnrollmentsApi.enroll(cohortId, email),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cohortsKeys.detail(cohortId) }),
  });
}

/** "Encerrar matrícula" (027/US5); the turma (its count) and its student list become stale, also after a refusal. */
export function useRemoveEnrollment(cohortId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) => cohortEnrollmentsApi.remove(cohortId, enrollmentId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: cohortsKeys.detail(cohortId) }),
  });
}
