"use client"

import { Timer, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSecondsLeft } from "./seconds-left"

/** From 5 minutes left the time turns to the warning colour, and from 1 minute to danger (exam-mode.md). */
const WARNING_FROM_S = 5 * 60
const DANGER_FROM_S = 60

/** "mm:ss", or "h:mm:ss" from one hour on. */
export function formatSecondsLeft(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * The time left of an exam (`ExamTimer`, 005 exam-mode.md, 018/FR-012): "mm:ss restantes" with
 * tabular digits and the `Timer` icon, the warning colour and `TriangleAlert` from 5 minutes, danger
 * from 1 minute (never colour alone: the icon and the text change too). `role="timer"` with
 * `aria-live="off"`: nothing is announced each second; the alerts and the countdown announce the
 * marks (`TimeAlert`, `FinalCountdown`). The time is the server's: `remaining` comes from its end.
 */
function ExamTimer({ remaining, className }: { remaining: () => number; className?: string }) {
  const seconds = useSecondsLeft(remaining)
  const state = seconds <= DANGER_FROM_S ? "danger" : seconds <= WARNING_FROM_S ? "warning" : "normal"
  const Icon = state === "normal" ? Timer : TriangleAlert
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label="Tempo restante"
      data-slot="exam-timer"
      data-state={state}
      className={cn(
        "inline-flex items-center gap-2 text-label",
        state === "danger" ? "text-danger-text" : state === "warning" ? "text-warning-text" : "text-foreground",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>
        <span className="tabular-nums">{formatSecondsLeft(seconds)}</span> restantes
      </span>
    </div>
  )
}

export { ExamTimer }
