"use client";

import { useEffect, useMemo, useRef } from "react";
import { EXAM_END_GRACE_MS } from "../schemas/exam-attempt";

/**
 * The milliseconds left of an exam attempt by the server's clock (018/FR-012, research T4, SC-002):
 * the end comes from the server, and the browser only counts the time elapsed since it read
 * `serverNow` (the offset is fixed on the first reading after each read of the activity). A reload
 * or another device reads both again, so the time shown is the server's within the network delay.
 * Before the start, or with no end, 0.
 */
export function useExamClock(endsAt: string | null, serverNow: string): () => number {
  return useMemo(() => {
    let offset: number | null = null;
    return () => {
      if (endsAt === null) return 0;
      offset ??= Date.parse(serverNow) - Date.now();
      return Date.parse(endsAt) - (Date.now() + offset);
    };
  }, [endsAt, serverNow]);
}

/**
 * Calls `onTimeUp` once the time and the server's grace are over (research T4, T5): the page reads
 * the activity again, and the server, which settled the attempt on that read, says how it ended.
 */
export function useTimeUp(remaining: () => number, active: boolean, onTimeUp: () => void): void {
  const callback = useRef(onTimeUp);
  useEffect(() => {
    callback.current = onTimeUp;
  });
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => callback.current(), Math.max(0, remaining() + EXAM_END_GRACE_MS + 500));
    return () => clearTimeout(timer);
  }, [remaining, active]);
}
