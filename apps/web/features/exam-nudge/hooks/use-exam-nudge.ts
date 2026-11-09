"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ATTENDANCE_POLL_MS } from "@/features/attendance/schemas/attendance";
import { examNudgeApi, isRetryable } from "../api/exam-nudge";
import { DISMISS_RETRY_MS } from "../schemas/exam-nudge";
import { readDismissed, rememberDismissed } from "../store/dismissed-nudges";

/** Query key: `["exam-nudge", activityId]`. */
export const examNudgeKey = (activityId: string) => ["exam-nudge", activityId] as const;

/** A warning to show: its id and the student's own name from the server. */
export interface ShownNudge {
  id: string;
  studentName: string;
}

/**
 * The teacher's discreet warning on the exam page (025/US2, research N7, N8): polled every 5 s only while `enabled`
 * (the exam running) and the page is visible. `dismiss` closes it at once, remembers its id on this device and sends
 * the dismissal in the background, again every 5 s and when the browser is back online until the server answers;
 * a warning already closed here never shows again, even if a poll still brings it.
 */
export function useExamNudge(activityId: string, enabled: boolean): { nudge: ShownNudge | null; dismiss: (nudgeId: string) => void } {
  const query = useQuery({
    queryKey: examNudgeKey(activityId),
    queryFn: () => examNudgeApi.get(activityId),
    enabled,
    refetchInterval: ATTENDANCE_POLL_MS,
    refetchIntervalInBackground: false,
  });
  const [dismissed, setDismissed] = useState<readonly string[]>(() => (typeof window === "undefined" ? [] : readDismissed()));
  /** Dismissals the server has not accepted yet. */
  const unsent = useRef(new Set<string>());

  const send = useCallback(
    async (nudgeId: string) => {
      try {
        await examNudgeApi.dismiss(activityId, nudgeId);
        unsent.current.delete(nudgeId);
      } catch (error) {
        // A refusal is final (the exam ended, paused or held): the warning is no longer this page's to close.
        if (!isRetryable(error)) unsent.current.delete(nudgeId);
      }
    },
    [activityId],
  );

  const dismiss = useCallback(
    (nudgeId: string) => {
      rememberDismissed(nudgeId);
      setDismissed((ids) => (ids.includes(nudgeId) ? ids : [...ids, nudgeId]));
      unsent.current.add(nudgeId);
      void send(nudgeId);
    },
    [send],
  );

  useEffect(() => {
    const resend = () => {
      for (const nudgeId of unsent.current) void send(nudgeId);
    };
    const timer = setInterval(() => {
      if (unsent.current.size > 0) resend();
    }, DISMISS_RETRY_MS);
    window.addEventListener("online", resend);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", resend);
    };
  }, [send]);

  const polled = enabled ? (query.data?.nudge ?? null) : null;
  return { nudge: polled && !dismissed.includes(polled.id) ? polled : null, dismiss };
}
