"use client";

import { useEffect, useRef } from "react";

/** What counts as interacting with the page (018 research T7); listened passively, never blocked. */
export const INTERACTION_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart", "scroll"] as const;

/**
 * The exam's inactivity (018/US4-3, research T7): after `limitSeconds` with none of the interaction
 * events, `onIdle(limitSeconds)` once, then nothing until the next interaction starts a new period.
 * Suspended while the page is hidden (that is already a screen exit) and while `enabled` is false —
 * paused, on hold, before the start and after the end. Only the browser sees interaction; the server
 * stamps the time and counts.
 */
export function useInactivity({ limitSeconds, enabled, onIdle }: { limitSeconds: number; enabled: boolean; onIdle: (idleSeconds: number) => void }) {
  const report = useRef(onIdle);
  useEffect(() => {
    report.current = onIdle;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    /** Reported for this period: silent until the next interaction. */
    let reported = false;
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const start = () => {
      stop();
      if (document.visibilityState === "hidden") return;
      timer = setTimeout(() => {
        timer = null;
        if (reported || document.visibilityState === "hidden") return;
        reported = true;
        report.current(limitSeconds);
      }, limitSeconds * 1000);
    };
    const interacted = () => {
      reported = false;
      start();
    };
    // Back on the page is a new period; while hidden nothing counts here.
    const visibility = () => (document.visibilityState === "hidden" ? stop() : interacted());
    const options = { capture: true, passive: true } as const;
    for (const type of INTERACTION_EVENTS) window.addEventListener(type, interacted, options);
    document.addEventListener("visibilitychange", visibility);
    start();
    return () => {
      stop();
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, interacted, options);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, limitSeconds]);
}
