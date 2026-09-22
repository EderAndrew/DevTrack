"use client";

import type { InvitationStatus, TeacherListResponse, TeacherStatus, TeacherView } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { teachersApi } from "../api/teachers";

export const teachersKeys = {
  all: ["teachers"] as const,
  lists: () => [...teachersKeys.all, "list"] as const,
  list: (status?: TeacherStatus) => (status ? ([...teachersKeys.lists(), status] as const) : teachersKeys.lists()),
  detail: (userId: string) => [...teachersKeys.all, "detail", userId] as const,
  invitations: (status?: InvitationStatus) =>
    status ? ([...teachersKeys.all, "invitations", status] as const) : ([...teachersKeys.all, "invitations"] as const),
};

/** Roster for a status filter; the unfiltered one starts from what the page read on the server. */
export const useTeachers = (status: TeacherStatus | undefined, initialData: TeacherListResponse) =>
  useQuery({
    queryKey: teachersKeys.list(status),
    queryFn: () => teachersApi.list(status),
    initialData: status === undefined ? initialData : undefined,
  });

/** Loads a filter into the cache on demand; choosing a filter always asks the API. */
export function useLoadTeachers() {
  const queryClient = useQueryClient();
  return (status?: TeacherStatus) =>
    queryClient.fetchQuery({ queryKey: teachersKeys.list(status), queryFn: () => teachersApi.list(status), staleTime: 0 });
}

/**
 * A teacher's status is derived by the API from the role and the invitations, so after every
 * action the visible roster is fetched again (as the Phase 001 screen did) and the other filters
 * are marked stale. Role actions also cache the returned `TeacherView`.
 */
function useAfterAction() {
  const queryClient = useQueryClient();
  return async (teacher?: TeacherView) => {
    if (teacher?.userId) queryClient.setQueryData(teachersKeys.detail(teacher.userId), teacher);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: teachersKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: teachersKeys.invitations() }),
    ]);
  };
}

export type TeacherAction = "resend" | "revoke" | "suspend" | "deactivate" | "reactivate";

export function useInviteTeacher() {
  const afterAction = useAfterAction();
  return useMutation({ mutationFn: teachersApi.invite, onSuccess: () => afterAction() });
}

/** Row actions; `id` is the invitation id for resend/revoke and the user id otherwise. */
export function useTeacherAction() {
  const afterAction = useAfterAction();
  return useMutation({
    mutationFn: async ({ action, id }: { action: TeacherAction; id: string }): Promise<TeacherView | undefined> => {
      switch (action) {
        case "resend":
          await teachersApi.resendInvitation(id);
          return undefined;
        case "revoke":
          await teachersApi.revokeInvitation(id);
          return undefined;
        default:
          return teachersApi[action](id);
      }
    },
    onSuccess: (teacher) => afterAction(teacher),
  });
}
