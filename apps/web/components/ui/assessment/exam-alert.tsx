"use client"

import { useRef } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/** One warning of exam-mode.md: what happened, its record and what to do. */
export interface ExamAlertText {
  title: string
  record: string
  guidance: string
}

/**
 * "Sair da avaliação?" (exam-mode.md, tentativa de sair da página). A work has no timer (015), so
 * what to do says the saved answers stay, not that the time keeps running.
 */
export const LEAVE_ATTEMPT: ExamAlertText = {
  title: "Sair da avaliação?",
  record: "Sua tentativa continua em andamento.",
  guidance: "Fique para continuar ou saia; suas respostas salvas continuam guardadas.",
}

/**
 * A warning that asks for a decision (`ExamAlert`, 005 exam-mode.md, 015/FR-012): an `AlertDialog`
 * with the title, the record line and what to do; "Continuar respondendo" keeps the student on the
 * attempt and is the dialog's first focus, the confirmation goes on. It never blocks the way out.
 */
function ExamAlert({
  open,
  onOpenChange,
  text,
  confirmLabel,
  cancelLabel = "Continuar respondendo",
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: ExamAlertText
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
}) {
  // Opened by a button or by the browser's back: the focus goes back where it was.
  const returnTo = useRef<HTMLElement | null>(null)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-slot="exam-alert"
        onOpenAutoFocus={() => {
          returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        }}
        onCloseAutoFocus={(event) => {
          if (!returnTo.current?.isConnected) return
          event.preventDefault()
          returnTo.current.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>{text.record}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="m-0 text-body">{text.guidance}</p>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { ExamAlert }
