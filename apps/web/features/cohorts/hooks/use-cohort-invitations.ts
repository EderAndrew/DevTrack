"use client";

import type { ClassInvitationListQuery, InviteStudentRequest } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cohortInvitationsApi } from "../api/cohort-invitations";
import { cohortsKeys } from "./use-cohorts";

/** Filters of the invitations list (the cursor is handled by the infinite query). */
export type CohortInvitationFilters = Omit<ClassInvitationListQuery, "cursor">;

/** Query keys: `["cohorts", id, "invitations", filters]` (027: the invitations are the turma's). */
export const cohortInvitationsKeys = {
  all: (cohortId: string) => [...cohortsKeys.detail(cohortId), "invitations"] as const,
  list: (cohortId: string, filters: CohortInvitationFilters) => [...cohortInvitationsKeys.all(cohortId), filters] as const,
};

/** Invitations of the class for `filters`, page by page ("Carregar mais"); the server searches and filters. */
export const useCohortInvitations = (cohortId: string, filters: CohortInvitationFilters) =>
  useInfiniteQuery({
    queryKey: cohortInvitationsKeys.list(cohortId, filters),
    queryFn: ({ pageParam }) => cohortInvitationsApi.list(cohortId, { ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

/** Invite, resend and cancel make every invitation list of the class stale. */
function useInvalidateInvitations(cohortId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: cohortInvitationsKeys.all(cohortId) });
}

export function useInviteStudent(cohortId: string) {
  const invalidate = useInvalidateInvitations(cohortId);
  return useMutation({
    mutationFn: (body: InviteStudentRequest) => cohortInvitationsApi.invite(cohortId, body),
    onSuccess: invalidate,
  });
}

export function useResendInvitation(cohortId: string) {
  const invalidate = useInvalidateInvitations(cohortId);
  return useMutation({
    mutationFn: (invitationId: string) => cohortInvitationsApi.resend(cohortId, invitationId),
    onSettled: invalidate,
  });
}

export function useCancelInvitation(cohortId: string) {
  const invalidate = useInvalidateInvitations(cohortId);
  return useMutation({
    mutationFn: (invitationId: string) => cohortInvitationsApi.cancel(cohortId, invitationId),
    onSettled: invalidate,
  });
}
