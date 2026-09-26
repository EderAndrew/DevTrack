"use client";

import type { AiExecutionView, RequestAiExecutionRequest } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { aiExecutionsApi } from "../api/ai-executions";
import { aiKeys } from "./use-ai-execution";

type RequestBody = Omit<RequestAiExecutionRequest, "idempotencyKey">;

/**
 * Asks for an execution. Each `request` is one user intent with a fresh idempotency key; `retry`
 * resends the last one with the same key, so a network retry never creates a second execution
 * (006/FR-025).
 */
export function useRequestAiExecution() {
  const queryClient = useQueryClient();
  const last = useRef<RequestAiExecutionRequest | null>(null);
  const mutation = useMutation({
    mutationFn: (body: RequestAiExecutionRequest) => aiExecutionsApi.request(body),
    onSuccess: async (view: AiExecutionView) => {
      queryClient.setQueryData(aiKeys.execution(view.id), view);
      await queryClient.invalidateQueries({ queryKey: aiKeys.lists() });
    },
  });
  return {
    ...mutation,
    request: (body: RequestBody) => {
      last.current = { ...body, idempotencyKey: crypto.randomUUID() };
      return mutation.mutateAsync(last.current);
    },
    retry: () => (last.current ? mutation.mutateAsync(last.current) : Promise.reject(new Error("nothing to retry"))),
  };
}
