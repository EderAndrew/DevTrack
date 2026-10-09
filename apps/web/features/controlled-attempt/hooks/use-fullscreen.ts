"use client";

import { useEffect, useState } from "react";

// Fullscreen of the attempt's page (015/FR-008, research F5, F14). A browser only enters it during
// a click, so "Iniciar em modo controlado" and "Voltar para tela cheia" call `enterFullscreen` in
// their handlers. A device without it keeps answering in the page without the portal's menu.

export const fullscreenSupported = () => typeof document !== "undefined" && document.fullscreenEnabled === true;

/** Asks for fullscreen; false when the device or the browser refuses (the attempt goes on anyway). */
export async function enterFullscreen(): Promise<boolean> {
  if (!fullscreenSupported() || document.fullscreenElement) return Boolean(document.fullscreenElement);
  try {
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === "undefined" || !document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {
    // Already out.
  }
}

/** Whether the page is in fullscreen now, following `fullscreenchange`. */
export function useFullscreen() {
  const [active, setActive] = useState(() => typeof document !== "undefined" && Boolean(document.fullscreenElement));
  useEffect(() => {
    const changed = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  return { supported: fullscreenSupported(), active };
}
