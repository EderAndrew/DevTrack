"use client";

import type { StudentHelpItem, StudentHelpState } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { isNetworkFailure, workHelpApi } from "../api/work-help";

/** Query keys: `["work-help", activityId]`. */
export const workHelpKeys = {
  state: (activityId: string) => ["work-help", activityId] as const,
};

/** While a request is pending, its state is read again this often (research F11)… */
export const HELP_POLL_MS = 1_500;
/** …up to this long; then the student sees the unavailable message and may ask again later. */
export const HELP_WAIT_MS = 60_000;

/**
 * The student's helps in the attempt (allowance, used, pending, items), polled while a request
 * waits for the AI. `waitExpired` turns on when the pending request took longer than `HELP_WAIT_MS`.
 */
export function useWorkHelp(activityId: string, enabled: boolean) {
  const expired = useRef<string | null>(null);
  const query = useQuery({
    queryKey: workHelpKeys.state(activityId),
    queryFn: () => workHelpApi.state(activityId),
    enabled,
    refetchInterval: (current) => {
      const pending = pendingOf(current.state.data);
      return pending && expired.current !== pending.id ? HELP_POLL_MS : false;
    },
  });
  const pendingId = pendingOf(query.data)?.id ?? null;
  const [expiredId, setExpiredId] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingId) return;
    const timer = setTimeout(() => {
      expired.current = pendingId;
      setExpiredId(pendingId);
    }, HELP_WAIT_MS);
    return () => clearTimeout(timer);
  }, [pendingId]);
  return { ...query, waitExpired: pendingId !== null && expiredId === pendingId };
}

const pendingOf = (state: StudentHelpState | undefined): StudentHelpItem | undefined => state?.items.find((item) => item.status === "REQUESTED");

/** Repeats after a dropped connection with the same key: the server answers the same request. */
const REQUEST_RETRIES = 2;

/** "Enviar": the pending request joins the state, which is then polled until the AI answers. */
export function useRequestHelp(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { questionId: string; question: string; idempotencyKey: string }) => workHelpApi.request(activityId, body),
    retry: (failures, error) => isNetworkFailure(error) && failures < REQUEST_RETRIES,
    retryDelay: 1_000,
    onSuccess: (item) => {
      queryClient.setQueryData<StudentHelpState>(workHelpKeys.state(activityId), (state) =>
        state ? { ...state, pending: item.status === "REQUESTED", items: [...state.items.filter((other) => other.id !== item.id), item] } : state,
      );
      void queryClient.invalidateQueries({ queryKey: workHelpKeys.state(activityId) });
    },
  });
}
