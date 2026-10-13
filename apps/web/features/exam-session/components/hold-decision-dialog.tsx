"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CANCEL_NOTICE, cancelQuestion, CONFIRM_CANCELLATION } from "../schemas/exam-session";

export interface HoldDecisionDialogProps {
  /** The student's name, said in the question. */
  name: string;
  disabled: boolean;
  onConfirm: () => void;
}

/**
 * "Confirmar cancelamento" (018/FR-021): the zero is a decision the teacher confirms after reading
 * "Cancelar a prova de <nome>? A nota será zero. Esta decisão é registrada."; "Voltar" sends nothing.
 */
export function HoldDecisionDialog({ name, disabled, onConfirm }: HoldDecisionDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="danger" aria-label={`${CONFIRM_CANCELLATION} ${name}`} disabled={disabled}>
          {CONFIRM_CANCELLATION}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{cancelQuestion(name)}</AlertDialogTitle>
          <AlertDialogDescription>{CANCEL_NOTICE}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={onConfirm}>
            {CONFIRM_CANCELLATION}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
