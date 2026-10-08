"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { formatTime } from "@/lib/messages/dates"

/** Official texts of exam-mode.md ("ExamAlert e FocusViolationWarning", perda de foco). */
export const FOCUS_WARNING_TITLE = "Você saiu da tela da avaliação"
export const FOCUS_WARNING_PENDING = "Estamos registrando este evento"
export const FOCUS_WARNING_GUIDANCE = "Continue respondendo. Se foi um engano, você não precisa fazer nada."
export const RETURN_TO_FULLSCREEN = "Voltar para tela cheia"

/** "Este evento foi registrado às 14:32." with the server's time. */
export const focusWarningRecord = (recordedAt: string) => `Este evento foi registrado às ${formatTime(recordedAt)}.`

/**
 * The warning shown after the student comes back to the attempt (`FocusViolationWarning`, 005
 * exam-mode.md, 015/FR-011): what happened, the record — the server's time, or "Estamos registrando
 * este evento" until the server confirms it — and what to do. After a fullscreen exit it offers
 * "Voltar para tela cheia". A polite `Alert` (`role="status"`): it never takes the focus, blocks or
 * threatens. Only displays: the page decides when.
 */
function FocusViolationWarning({
  recordedAt,
  onReturnToFullscreen,
  onDismiss,
  className,
}: {
  /** The server's time of the exit (ISO), null while it isn't confirmed. */
  recordedAt: string | null
  /** After a fullscreen exit, when the device allows it. */
  onReturnToFullscreen?: () => void
  /** "Entendi": hides the warning. */
  onDismiss?: () => void
  className?: string
}) {
  return (
    <Alert data-slot="focus-violation-warning" variant="warning" className={className}>
      <AlertTitle>{FOCUS_WARNING_TITLE}</AlertTitle>
      <AlertDescription>
        <p className="m-0">{recordedAt ? focusWarningRecord(recordedAt) : FOCUS_WARNING_PENDING}</p>
        <p className="m-0">{FOCUS_WARNING_GUIDANCE}</p>
        {onReturnToFullscreen || onDismiss ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {onReturnToFullscreen ? (
              <Button type="button" size="sm" onClick={onReturnToFullscreen}>
                {RETURN_TO_FULLSCREEN}
              </Button>
            ) : null}
            {onDismiss ? (
              <Button type="button" size="sm" variant="secondary" onClick={onDismiss}>
                Entendi
              </Button>
            ) : null}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}

export { FocusViolationWarning }
