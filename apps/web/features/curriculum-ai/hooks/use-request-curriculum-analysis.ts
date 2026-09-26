"use client";

import type { RequestCurriculumAnalysisRequest } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCancelAiExecution } from "@/features/ai/hooks/use-cancel-ai-execution";
import { curriculumAiApi } from "../api/curriculum-ai";
import { curriculumAiKeys } from "./use-curriculum-ai-status";

/** Asks for an analysis; the server returns the active one instead of a second (007/FR-014). */
export function useRequestCurriculumAnalysis(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RequestCurriculumAnalysisRequest = {}) => curriculumAiApi.requestAnalysis(documentId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: curriculumAiKeys.status(documentId) }),
  });
}

/** The 006 cancellation (007/FR-019), then the document's status again. */
export function useCancelCurriculumAnalysis(documentId: string) {
  const queryClient = useQueryClient();
  const cancel = useCancelAiExecution();
  return {
    ...cancel,
    mutate: (executionId: string) =>
      cancel.mutate(executionId, {
        onSettled: () => queryClient.invalidateQueries({ queryKey: curriculumAiKeys.status(documentId) }),
      }),
  };
}
