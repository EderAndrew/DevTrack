"use client";

import { useMutation } from "@tanstack/react-query";
import { invitationsApi } from "../api/invitations";

// The token travels only as a mutation variable, never in a query key, and the mutation leaves
// memory as soon as nothing observes it (FR-027). 401 answers (SIGN_IN_REQUIRED, WRONG_ACCOUNT
// flows) are shown on the screen, so these opt out of the global redirect.
const WITH_TOKEN = { meta: { authRedirect: false }, gcTime: 0 } as const;

export const usePreviewInvitation = () => useMutation({ mutationFn: invitationsApi.preview, ...WITH_TOKEN });
export const useAcceptInvitation = () => useMutation({ mutationFn: invitationsApi.accept, ...WITH_TOKEN });
