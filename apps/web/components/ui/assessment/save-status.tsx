"use client"

import * as React from "react"
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Status } from "@/components/ui/status"

type SaveState = "idle" | "saving" | "saved" | "error"

/** "Salvando…" only after 400 ms, so a quick save → saved never flashes (exam-mode.md "SaveStatus"). */
const SAVING_DELAY_MS = 400
/** "Resposta salva" is announced at most once every 10 s. */
const ANNOUNCE_EVERY_MS = 10_000
const ANNOUNCE_GAP_MS = 50

const ERROR_TEXT =
  "Não foi possível salvar. Sua resposta continua na tela; tentaremos de novo. Se persistir, avise o professor."

/**
 * The save state of the answers (`SaveStatus`, 012/FR-018), with the official texts: saving (no
 * announcement), saved (`role="status"`, throttled) and error (`role="alert"`, immediate) with
 * "Tentar novamente". Only displays: the page decides when to save.
 */
function SaveStatus({
  state,
  onRetry,
  className,
}: {
  state: SaveState
  /** Sends the content on screen again. */
  onRetry?: () => void
  className?: string
}) {
  // The last state other than saving, adjusted during render; "Salvando…" replaces it only after 400 ms.
  const [settled, setSettled] = React.useState<SaveState>(state === "saving" ? "idle" : state)
  if (state !== "saving" && state !== settled) setSettled(state)
  const [savingVisible, setSavingVisible] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState("")
  const lastAnnounced = React.useRef(0)

  React.useEffect(() => {
    if (state !== "saving") return
    const timer = setTimeout(() => setSavingVisible(true), SAVING_DELAY_MS)
    return () => {
      clearTimeout(timer)
      setSavingVisible(false)
    }
  }, [state])

  React.useEffect(() => {
    if (state !== "saved") return
    const now = Date.now()
    if (now - lastAnnounced.current < ANNOUNCE_EVERY_MS) return
    lastAnnounced.current = now
    // Emptied, then filled: the live region announces again even when the text is the same.
    const clear = setTimeout(() => setAnnouncement(""), 0)
    const announce = setTimeout(() => setAnnouncement("Resposta salva"), ANNOUNCE_GAP_MS)
    return () => {
      clearTimeout(clear)
      clearTimeout(announce)
    }
  }, [state])

  const shown: SaveState = state === "saving" ? (savingVisible ? "saving" : settled) : state

  return (
    <div data-slot="save-status" data-state={shown} className={cn("flex flex-col gap-2 text-body-sm", className)}>
      {shown === "saving" ? (
        <span className="inline-flex items-center gap-2 text-text-secondary">
          <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          Salvando…
        </span>
      ) : null}
      {shown === "saved" ? (
        <span className="inline-flex items-center gap-2 text-success-text">
          <CircleCheck aria-hidden="true" className="size-4" />
          Resposta salva
        </span>
      ) : null}
      {shown === "error" ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-danger-text">
          <span className="inline-flex items-start gap-2">
            <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
            {ERROR_TEXT}
          </span>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          ) : null}
        </div>
      ) : null}
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}

type AttemptState = "IN_PROGRESS" | "SUBMITTED" | "SUBMITTED_LATE" | "CLOSED"

const ATTEMPT: Record<AttemptState, { label: string; variant: "info" | "success" | "warning" | "neutral" }> = {
  IN_PROGRESS: { label: "Em andamento", variant: "info" },
  SUBMITTED: { label: "Entregue", variant: "success" },
  SUBMITTED_LATE: { label: "Entregue com atraso", variant: "warning" },
  CLOSED: { label: "Encerrada", variant: "neutral" },
}

/** The attempt's state in words (`AttemptStatus`), with the `Badge` meanings. */
function AttemptStatus({ state, className }: { state: AttemptState; className?: string }) {
  const { label, variant } = ATTEMPT[state]
  return (
    <Status data-slot="attempt-status" variant={variant} className={className}>
      {label}
    </Status>
  )
}

export { AttemptStatus, SaveStatus, type AttemptState, type SaveState }
