"use client"

import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useCrossedMarks, useSecondsLeft } from "./seconds-left"

/** The marks of 018/FR-012 (research T17), in seconds left, with their official texts. */
export const TIME_ALERTS = [
  { at: 10 * 60, text: "Faltam 10 minutos." },
  { at: 5 * 60, text: "Faltam 5 minutos." },
] as const

/**
 * The time alerts of an exam (`TimeAlert`, 018/FR-012, contracts/web-ui.md): "Faltam 10 minutos."
 * and "Faltam 5 minutos." when the time crosses each mark. Non-blocking: a polite `Alert`
 * (`role="status"`) above the questions, announced once, never taking the focus; "Entendi" hides
 * it. A mark already behind when the exam opens (a short exam, or a reload after it) shows nothing.
 */
function TimeAlert({ remaining, className }: { remaining: () => number; className?: string }) {
  const seconds = useSecondsLeft(remaining)
  const crossed = useCrossedMarks(
    seconds,
    TIME_ALERTS.map((alert) => alert.at),
  )
  const [dismissed, setDismissed] = useState<number | null>(null)
  // The latest mark crossed (the smallest); the countdown takes over in the last seconds.
  const current = TIME_ALERTS.filter((alert) => crossed.includes(alert.at)).at(-1)
  if (!current || dismissed === current.at || seconds === 0) return null
  return (
    <Alert data-slot="time-alert" variant="warning" className={className}>
      <AlertTitle>{current.text}</AlertTitle>
      <AlertDescription>
        <p className="m-0">Revise as suas respostas e entregue antes do fim.</p>
        <div className="pt-1">
          <Button type="button" size="sm" variant="secondary" onClick={() => setDismissed(current.at)}>
            Entendi
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

export { TimeAlert }
