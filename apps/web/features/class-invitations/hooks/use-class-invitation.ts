"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { classInvitationAcceptanceApi } from "../api/class-invitations";

// The token travels only as a mutation variable, never in a query key, and the mutation leaves
// memory as soon as nothing observes it (001/FR-027). 401 answers (SIGN_IN_REQUIRED) are shown on
// the screen, so these opt out of the global redirect.
const WITH_TOKEN = { meta: { authRedirect: false }, gcTime: 0 } as const;

export const usePreviewClassInvitation = () =>
  useMutation({ mutationFn: classInvitationAcceptanceApi.preview, ...WITH_TOKEN });

/** A successful acceptance may start a session: everything cached about "me" is stale. */
export function useAcceptClassInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: classInvitationAcceptanceApi.accept,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
    ...WITH_TOKEN,
  });
}
