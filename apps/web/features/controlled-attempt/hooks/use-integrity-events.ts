"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { integrityApi, isNetworkFailure, isRetryable } from "../api/integrity";
import { createEventQueue, type EventQueue, type SentListener } from "../store/pending-events";

/** While events wait (no connection, 429), they are tried again this often and when the browser is back online. */
export const RESEND_EVERY_MS = 5_000;

/**
 * The integrity events of the student's open attempt (015/FR-010, research F4): one queue per
 * page, sent in order with `keepalive` (a page-leave sent while the tab closes still arrives),
 * kept in this browser while there is no connection; the browser's `offline` records the drop.
 * `recordedAt` gives the server's time for the warning.
 */
export function useIntegrityEvents({
  userId,
  activityId,
  enabled,
  onSent,
}: {
  userId: string;
  activityId: string;
  enabled: boolean;
  /** 018: each confirmed batch with the server's answer (an exam's occurrence count). */
  onSent?: SentListener;
}) {
  const [queue] = useState<EventQueue>(() =>
    createEventQueue({
      userId,
      activityId,
      send: (events) => integrityApi.record(activityId, events, { keepalive: true }),
      retryable: isRetryable,
      offline: isNetworkFailure,
    }),
  );
  const sent = useRef(onSent);
  useEffect(() => {
    sent.current = onSent;
  });
  useEffect(() => queue.subscribeSent((result, events) => sent.current?.(result, events)), [queue]);
  // Re-render when an event is confirmed or queued.
  const [, changed] = useReducer((count: number) => count + 1, 0);
  useEffect(() => queue.subscribe(changed), [queue]);

  useEffect(() => {
    if (!enabled) return;
    void queue.flush();
    const online = () => void queue.flush();
    const offline = () => queue.connectionLost();
    const timer = setInterval(() => {
      if (queue.pendingCount() > 0) void queue.flush();
    }, RESEND_EVERY_MS);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [enabled, queue]);

  // `flush`: 016 "Sair da sala" sends what waits before the pause (research M10).
  return { record: queue.record, recordedAt: queue.recordedAt, pendingCount: queue.pendingCount(), flush: queue.flush };
}
