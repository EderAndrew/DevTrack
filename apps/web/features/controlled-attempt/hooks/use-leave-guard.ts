"use client";

import { useEffect, useRef } from "react";

/**
 * Asks before leaving the open attempt, never preventing it (015/FR-012, research F5): closing or
 * reloading shows the browser's own prompt (its text can't be set); the browser's back opens the
 * page's "Sair da avaliação?" (`onBack`) and stays on the attempt meanwhile. Each attempt to leave
 * is reported (`onLeaveAttempt`).
 */
export function useLeaveGuard({ enabled, onLeaveAttempt, onBack }: { enabled: boolean; onLeaveAttempt: () => void; onBack: () => void }) {
  const handlers = useRef({ onLeaveAttempt, onBack });
  useEffect(() => {
    handlers.current = { onLeaveAttempt, onBack };
  });

  useEffect(() => {
    if (!enabled) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      handlers.current.onLeaveAttempt();
      event.preventDefault();
      event.returnValue = "";
    };
    // One entry of our own: the back button lands on it and the page asks.
    window.history.pushState({ devtrackLeaveGuard: true }, "", window.location.href);
    const popState = () => {
      window.history.pushState({ devtrackLeaveGuard: true }, "", window.location.href);
      handlers.current.onLeaveAttempt();
      handlers.current.onBack();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", popState);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", popState);
    };
  }, [enabled]);
}
