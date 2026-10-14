"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/** The occurrence kinds an exam counts (018/FR-015): the screen, fullscreen, the clipboard, inactivity. */
export type OccurrenceKind = "SCREEN" | "FULLSCREEN" | "CLIPBOARD" | "INACTIVITY"

/** The warnings before the hold (`EXAM_WARNINGS` of the contract). */
export const WARNINGS_ALLOWED = 3

/** What happened, in neutral words (018/US4-8, FR-032). */
export const OCCURRENCE_LABELS: Record<OccurrenceKind, string> = {
  SCREEN: "Você saiu da tela da prova",
  FULLSCREEN: "Você saiu da tela cheia",
  CLIPBOARD: "Copiar, recortar, colar ou arrastar texto não é permitido na prova",
  INACTIVITY: "Você ficou sem interagir com a prova além do limite",
}

export const WARNING_RULE = "Na 4ª ocorrência a prova será encerrada."
export const RETURN_TO_EXAM = "Voltar à prova"

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** The whole warning in one line: "Aviso 1 de 3: você saiu da tela da prova. Na 4ª ocorrência…". */
export const warningText = (ordinal: number, kind: OccurrenceKind) =>
  `Aviso ${ordinal} de ${WARNINGS_ALLOWED}: ${lowerFirst(OCCURRENCE_LABELS[kind])}. ${WARNING_RULE}`

/**
 * "Aviso n de 3" (`WarningDialog`, 018/FR-017, contracts/web-ui.md): after each occurrence the
 * server counted, an `AlertDialog` with the number, the kind and the rule of the 4th. Its one answer,
 * "Voltar à prova", takes the focus; Enter or Esc close it through `onReturn`, which the page uses to
 * go back to fullscreen. The count is the server's: this only shows it.
 */
function WarningDialog({
  open,
  ordinal,
  kind,
  onReturn,
}: {
  open: boolean
  ordinal: number
  kind: OccurrenceKind
  onReturn: () => void
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onReturn()
      }}
    >
      <AlertDialogContent data-slot="warning-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Aviso {ordinal} de {WARNINGS_ALLOWED}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {OCCURRENCE_LABELS[kind]}. {WARNING_RULE}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* The dialog's only answer, so the one it focuses (Radix focuses Cancel); it closes it → `onReturn`. */}
          <AlertDialogCancel variant="primary">{RETURN_TO_EXAM}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { WarningDialog }
