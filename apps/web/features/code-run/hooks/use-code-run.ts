"use client";

import { CODE_RUN_POLL_MS, type CodeRun } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { codeRunsApi, retryAfterSecondsOf } from "../api/code-runs";

/** Query keys: `["code-runs", "latest", activityId, questionId]` and `["code-runs", runId]`. */
export const codeRunKeys = {
  latest: (activityId: string, questionId: string) => ["code-runs", "latest", activityId, questionId] as const,
  run: (runId: string | null) => ["code-runs", runId] as const,
};

export const isPendingRun = (run: CodeRun | null | undefined): boolean => run?.status === "QUEUED" || run?.status === "RUNNING";

export { retryAfterSecondsOf };

/**
 * The runs of one question (019 research B13): the latest of the student's attempt on opening, then
 * the run "Executar" created (or the pending one the server returned), polled every
 * `CODE_RUN_POLL_MS` while QUEUED/RUNNING. TanStack Query pauses the interval while the page is
 * hidden (`refetchIntervalInBackground` off), so a hidden tab never polls. A pending run of another
 * question is followed only to know when it ends; its result is never shown here (FR-009).
 */
export function useCodeRun(activityId: string, questionId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const latest = useQuery({
    queryKey: codeRunKeys.latest(activityId, questionId),
    queryFn: () => codeRunsApi.latest(activityId, questionId),
    enabled,
  });
  const [followedId, setFollowedId] = useState<string | null>(null);
  const runId = followedId ?? latest.data?.run?.id ?? null;
  const followed = useQuery({
    queryKey: codeRunKeys.run(runId),
    queryFn: () => codeRunsApi.get(runId!),
    enabled: enabled && runId !== null,
    initialData: () => (runId !== null && latest.data?.run?.id === runId ? latest.data.run : undefined),
    refetchInterval: (query) => (isPendingRun(query.state.data) ? CODE_RUN_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
  const create = useMutation({
    mutationFn: (sourceCode: string) => codeRunsApi.create(activityId, questionId, sourceCode),
    onSuccess: (run) => {
      queryClient.setQueryData(codeRunKeys.run(run.id), run);
      setFollowedId(run.id);
      // Once the other question's run ends, this question shows its own latest again.
      if (run.questionId !== questionId) void queryClient.invalidateQueries({ queryKey: codeRunKeys.latest(activityId, questionId) });
    },
  });

  const current = followed.data ?? null;
  const otherQuestion = current !== null && current.questionId !== questionId;
  const own = otherQuestion ? (latest.data?.run ?? null) : current;
  return {
    /** The run to show: the followed one of this question, or this question's latest. */
    run: own,
    /** A run of the student is pending (any question): "Executar" waits for it. */
    pending: isPendingRun(current) || create.isPending,
    /** The pending run is of another question. */
    otherQuestion: otherQuestion && isPendingRun(current),
    execute: (sourceCode: string) => create.mutate(sourceCode),
    error: create.error,
    reset: () => create.reset(),
  };
}
