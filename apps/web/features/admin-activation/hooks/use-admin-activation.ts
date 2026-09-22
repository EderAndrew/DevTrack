"use client";

import { useMutation } from "@tanstack/react-query";
import { adminActivationApi } from "../api/admin-activation";

// The token travels only as a mutation variable, never in a query key, and the mutation leaves
// memory as soon as nothing observes it (FR-027). 401 SIGN_IN_REQUIRED is an answer to show, not a
// refused session, so these opt out of the global redirect.
const WITH_TOKEN = { meta: { authRedirect: false }, gcTime: 0 } as const;

export const usePreviewAdminActivation = () => useMutation({ mutationFn: adminActivationApi.preview, ...WITH_TOKEN });
export const useActivateAdmin = () => useMutation({ mutationFn: adminActivationApi.activate, ...WITH_TOKEN });
