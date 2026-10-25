"use client";

import type { CreateFeedbackRequest } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { feedbackApi, sendFailure } from "../api/feedback-api";

/** Query keys: `["feedback", "mine"]` is the student's list (US3). */
export const feedbackKeys = {
  mine: ["feedback", "mine"] as const,
};

/** "Enviar": a retry of the same dialog carries the same `submissionId`, so the server keeps one feedback. */
export function useSendFeedback() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: CreateFeedbackRequest) => feedbackApi.send(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedbackKeys.mine }),
  });
  return { ...mutation, failure: mutation.error ? sendFailure(mutation.error) : null };
}
