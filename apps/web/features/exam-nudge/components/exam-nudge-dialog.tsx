"use client";

import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NUDGE_ACKNOWLEDGE, NUDGE_TITLE, nudgeText } from "../schemas/exam-nudge";
import type { ShownNudge } from "../hooks/use-exam-nudge";

/**
 * "Mensagem do professor" (025/US2, contracts/ui.md, research N8): the Design System's `AlertDialog`
 * (`role="alertdialog"`, focus trapped, back where it was on close), portalled into `body`, so it opens and closes
 * inside the exam's fullscreen without leaving it. Its one answer, "Entendi" (Escape does the same), closes it at
 * once through `onAcknowledge`; the page decides when it shows (`nudge` null hides it without a dismissal).
 */
export function ExamNudgeDialog({ nudge, onAcknowledge }: { nudge: ShownNudge | null; onAcknowledge: (nudgeId: string) => void }) {
  // The dialog opens by itself (no trigger): the focus goes back to where the student was, e.g. the answer field.
  const previous = useRef<HTMLElement | null>(null);
  return (
    <AlertDialog
      open={nudge !== null}
      onOpenChange={(next) => {
        if (!next && nudge) onAcknowledge(nudge.id);
      }}
    >
      <AlertDialogContent
        data-slot="exam-nudge-dialog"
        onOpenAutoFocus={() => {
          previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (previous.current?.isConnected) previous.current.focus();
          previous.current = null;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{NUDGE_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{nudge ? nudgeText(nudge.studentName) : null}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* The only answer, so the one Radix focuses; closing → `onAcknowledge`. */}
          <AlertDialogCancel variant="primary">{NUDGE_ACKNOWLEDGE}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
