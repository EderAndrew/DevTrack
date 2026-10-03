"use client";

import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

/** The minutes before the deadline at which the screen warns (012 contracts/web-ui.md). */
export type DeadlineWarning = 10 | 1;

/**
 * "Faltam 10 minutos" and "Falta 1 minuto" (research P10): the time left is measured from the
 * server's clock (`serverNow`), never the browser's; the browser only counts the time elapsed since
 * the page got it. Each warning appears once and is replaced by the next.
 */
export function useDeadlineWarning(deadline: string, serverNow: string, active: boolean): DeadlineWarning | null {
  const [warning, setWarning] = useState<DeadlineWarning | null>(null);

  useEffect(() => {
    if (!active) return;
    // Server time = browser time + skew, fixed when the page got `serverNow`.
    const skew = Date.parse(serverNow) - Date.now();
    const leftAt = () => Date.parse(deadline) - (Date.now() + skew);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (minutes: DeadlineWarning) => {
      const wait = leftAt() - minutes * MINUTE_MS;
      if (leftAt() <= 0) return;
      timers.push(setTimeout(() => setWarning((current) => (current === 1 && minutes === 10 ? current : minutes)), Math.max(0, wait)));
    };
    schedule(10);
    schedule(1);
    return () => timers.forEach(clearTimeout);
  }, [deadline, serverNow, active]);

  return active ? warning : null;
}
