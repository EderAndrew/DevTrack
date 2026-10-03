"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearAllPendingAnswers } from "@/features/student-activities/store/pending-answers";
import { authApi } from "../api/auth";

// Public flows answer 401 as a result to show (INVALID_CREDENTIALS, SIGN_IN_REQUIRED), not as a
// refused session: they opt out of the global redirect of lib/query/query-client.ts.
const PUBLIC = { meta: { authRedirect: false } } as const;

// Tokens of e-mailed links travel only as mutation variables, never in a query key, and the
// mutation is dropped from memory as soon as nothing observes it (FR-027).
const WITH_TOKEN = { ...PUBLIC, gcTime: 0 } as const;

/**
 * A new session starts from an empty cache: screens still mounted when the previous one ended may
 * have put their data back, and nothing of it may reach the next person to sign in (FR-024).
 */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: authApi.login, ...PUBLIC, onSuccess: () => queryClient.clear() });
}

export const useResendVerification = () => useMutation({ mutationFn: authApi.resendVerification, ...PUBLIC });
export const useRequestPasswordReset = () => useMutation({ mutationFn: authApi.requestPasswordReset, ...PUBLIC });
export const useVerifyEmail = () => useMutation({ mutationFn: authApi.verifyEmail, ...WITH_TOKEN });
export const useConfirmPasswordReset = () => useMutation({ mutationFn: authApi.confirmPasswordReset, ...WITH_TOKEN });

/** What a session leaves in this browser: the query cache and the unsent answers (012/FR-019). */
const forgetSession = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.clear();
  clearAllPendingAnswers();
};

/**
 * Logout and "sair de todos": on success the whole cache and the unsent answers are dropped before
 * the caller navigates, so the next person in this browser sees nothing of this session (FR-024).
 * A plain logout also clears on failure — an already-ended session is fine, the goal is to leave.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: authApi.logout, ...PUBLIC, onSettled: () => forgetSession(queryClient) });
}

export function useLogoutAll() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: authApi.logoutAll, ...PUBLIC, onSuccess: () => forgetSession(queryClient) });
}
