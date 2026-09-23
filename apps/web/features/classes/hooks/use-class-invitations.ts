"use client";

import type { ClassInvitationListQuery, InviteStudentRequest } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { classInvitationsApi } from "../api/class-invitations";
import { classesKeys } from "./use-classes";

/** Filters of the invitations list (the cursor is handled by the infinite query). */
export type ClassInvitationFilters = Omit<ClassInvitationListQuery, "cursor">;

/** Query keys of 003 contracts/web-ui.md: `["classes", id, "invitations", filters]`. */
export const classInvitationsKeys = {
  all: (classId: string) => [...classesKeys.detail(classId), "invitations"] as const,
  list: (classId: string, filters: ClassInvitationFilters) => [...classInvitationsKeys.all(classId), filters] as const,
};

/** Invitations of the class for `filters`, page by page ("Carregar mais"); the server searches and filters. */
export const useClassInvitations = (classId: string, filters: ClassInvitationFilters) =>
  useInfiniteQuery({
    queryKey: classInvitationsKeys.list(classId, filters),
    queryFn: ({ pageParam }) => classInvitationsApi.list(classId, { ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

/** Invite, resend and cancel make every invitation list of the class stale. */
function useInvalidateInvitations(classId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: classInvitationsKeys.all(classId) });
}

export function useInviteStudent(classId: string) {
  const invalidate = useInvalidateInvitations(classId);
  return useMutation({
    mutationFn: (body: InviteStudentRequest) => classInvitationsApi.invite(classId, body),
    onSuccess: invalidate,
  });
}

export function useResendInvitation(classId: string) {
  const invalidate = useInvalidateInvitations(classId);
  return useMutation({
    mutationFn: (invitationId: string) => classInvitationsApi.resend(classId, invitationId),
    onSettled: invalidate,
  });
}

export function useCancelInvitation(classId: string) {
  const invalidate = useInvalidateInvitations(classId);
  return useMutation({
    mutationFn: (invitationId: string) => classInvitationsApi.cancel(classId, invitationId),
    onSettled: invalidate,
  });
}
