"use client"

import { useCrossedMarks, useSecondsLeft } from "./seconds-left"

/** The countdown covers the last 10 seconds (018/FR-012, research T17). */
export const FINAL_COUNTDOWN_S = 10
export const FINAL_COUNTDOWN_ANNOUNCEMENT = "Faltam 10 segundos."

/**
 * The last seconds of an exam (`FinalCountdown`, 018/FR-012, contracts/web-ui.md): a centered
 * 10…1 over the page, which never takes the focus nor blocks the answers (no pointer events). The
 * number is visual only; screen readers get one `role="alert"`, "Faltam 10 segundos.", announced
 * once. No animation: the number just changes, with or without `prefers-reduced-motion`. An exam
 * that opens with less than 10 seconds left shows nothing.
 */
function FinalCountdown({ remaining }: { remaining: () => number }) {
  const seconds = useSecondsLeft(remaining)
  const crossed = useCrossedMarks(seconds, [FINAL_COUNTDOWN_S]).length > 0
  if (!crossed || seconds === 0) return null
  return (
    <div data-slot="final-countdown" className="pointer-events-none fixed inset-0 z-overlay flex items-center justify-center">
      <div className="flex min-w-24 flex-col items-center gap-1 rounded-lg border border-border bg-surface p-6 shadow-overlay">
        <span aria-hidden="true" className="text-display tabular-nums text-danger-text">
          {seconds}
        </span>
        <span aria-hidden="true" className="text-body-sm text-text-secondary">
          {seconds === 1 ? "segundo" : "segundos"}
        </span>
        <span role="alert" className="sr-only">
          {FINAL_COUNTDOWN_ANNOUNCEMENT}
        </span>
      </div>
    </div>
  )
}

export { FinalCountdown }
