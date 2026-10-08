"use client";

import type { ClientIntegrityEventType } from "@repo/contracts";
import { useEffect, useRef, useState } from "react";
import { type FocusSignal, focusReducer, initialFocus } from "./focus-reducer";
import { fullscreenSupported } from "./use-fullscreen";

/** The exit the warning is about, by the id of its event (its server time comes from the queue). */
export interface ExitWarning {
  eventId: string;
  kind: "SCREEN" | "FULLSCREEN";
}

/**
 * Watches the window and the document during an open CONTROLLED attempt (015/FR-009, FR-011,
 * research F5): `blur`/`focus`, `visibilitychange` and `fullscreenchange` go through the pure
 * reducer, each event it emits is recorded (`record` returns its id), and the student sees a
 * warning when they come back from the screen or as soon as fullscreen ends. On start, a device
 * without fullscreen or without the Page Visibility API is recorded once.
 */
export function useFocusMonitor({ enabled, record }: { enabled: boolean; record: (type: ClientIntegrityEventType) => string }) {
  const [warning, setWarning] = useState<ExitWarning | null>(null);
  const write = useRef(record);
  useEffect(() => {
    write.current = record;
  });

  useEffect(() => {
    if (!enabled) return;
    let state = initialFocus(Boolean(document.fullscreenElement));
    let screenExit: string | null = null;
    const apply = (signal: FocusSignal) => {
      const step = focusReducer(state, signal);
      state = step.state;
      for (const type of step.emit) {
        const eventId = write.current(type);
        if (type === "SCREEN_LEFT") screenExit = eventId;
        if (type === "SCREEN_RETURNED" && screenExit) setWarning({ eventId: screenExit, kind: "SCREEN" });
        if (type === "FULLSCREEN_EXITED") setWarning({ eventId, kind: "FULLSCREEN" });
      }
    };
    if (!fullscreenSupported()) write.current("FULLSCREEN_UNAVAILABLE");
    if (typeof document.visibilityState !== "string") write.current("DETECTION_UNAVAILABLE");

    // The window's own focus only, and only when the document really lost it: moving the focus
    // inside the page (a field, a dialog) may blur the window's viewport, never the document.
    let pendingBlur: ReturnType<typeof setTimeout> | null = null;
    const blur = (event: FocusEvent) => {
      if (event.target instanceof Node) return;
      const at = Date.now();
      if (pendingBlur) clearTimeout(pendingBlur);
      pendingBlur = setTimeout(() => {
        pendingBlur = null;
        if (!document.hasFocus()) apply({ type: "blur", at });
      }, 0);
    };
    const focus = (event: FocusEvent) => {
      if (!(event.target instanceof Node)) apply({ type: "focus", at: Date.now() });
    };
    const visibility = () =>
      apply(document.visibilityState === "hidden" ? { type: "hidden", at: Date.now() } : { type: "visible", at: Date.now(), focused: document.hasFocus() });
    const fullscreen = () => apply({ type: document.fullscreenElement ? "fullscreen-enter" : "fullscreen-exit", at: Date.now() });
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("fullscreenchange", fullscreen);
    return () => {
      if (pendingBlur) clearTimeout(pendingBlur);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", fullscreen);
    };
  }, [enabled]);

  return { warning: enabled ? warning : null, dismiss: () => setWarning(null) };
}
