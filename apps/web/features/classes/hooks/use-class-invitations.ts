"use client";

import type { InviteStudentRequest } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { classInvitationsApi } from "../api/class-invitations";
import { classesKeys } from "./use-classes";

/** Query keys of 003 contracts/web-ui.md: `["classes", id, "invitations", filters]`. */
export const classInvitationsKeys = {
  all: (classId: string) => [...classesKeys.detail(classId), "invitations"] as const,
};

/** Invites a student; the class's invitation lists become stale. */
export function useInviteStudent(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteStudentRequest) => classInvitationsApi.invite(classId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classInvitationsKeys.all(classId) }),
  });
}
