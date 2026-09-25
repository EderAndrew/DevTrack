"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { aiExecutionsApi } from "../api/ai-executions";
import { aiKeys } from "./use-ai-execution";

/** Cancels an execution (006/FR-027): the answer replaces the cached one and the lists refresh. */
export function useCancelAiExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiExecutionsApi.cancel(id),
    onSuccess: async (view) => {
      queryClient.setQueryData(aiKeys.execution(view.id), view);
      await queryClient.invalidateQueries({ queryKey: aiKeys.lists() });
    },
  });
}
