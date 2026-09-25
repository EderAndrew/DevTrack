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

export interface AiStatusToggleProps {
  /** true: the action disables; false: it enables. */
  disabling: boolean;
  /** Name of what changes, for the accessible name of the button ("Desabilitar Agente X"). */
  subject: string;
  title: string;
  consequences: string;
  pending: boolean;
  onConfirm: () => void;
}

/**
 * "Desabilitar" (danger) or "Habilitar" of an agent or a model config, always confirmed by an
 * `AlertDialog` that says the consequences (006 contracts/web-ui.md); the dialog traps focus and
 * returns it to the button.
 */
export function AiStatusToggle({ disabling, subject, title, consequences, pending, onConfirm }: AiStatusToggleProps) {
  const label = disabling ? "Desabilitar" : "Habilitar";
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={disabling ? "danger" : "secondary"} aria-label={`${label} ${subject}`} aria-busy={pending || undefined} disabled={pending}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{consequences}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant={disabling ? "danger" : "default"} onClick={onConfirm}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
