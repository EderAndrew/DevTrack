"use client";

import type { ClassStatus, ClassView } from "@repo/contracts";
import { useState } from "react";
import { ErrorSummary, type FormError } from "@/components/shared";
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
import { messageForError } from "@/lib/messages/error-messages";
import { useChangeClassStatus } from "../hooks/use-classes";

const DONE: Record<ClassStatus, string> = {
  ACTIVE: "Turma reativada.",
  INACTIVE: "Turma inativada.",
  ARCHIVED: "Turma arquivada.",
};

/**
 * Status actions of a class (FR-004, FR-005): Inativar/Reativar, and Arquivar after a
 * confirmation, since it cannot be undone and cancels the pending invitations. An archived
 * class offers nothing; the API checks every transition again.
 */
export function ClassStatusActions({ schoolClass }: { schoolClass: ClassView }) {
  const change = useChangeClassStatus(schoolClass.id);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");

  if (schoolClass.status === "ARCHIVED") return null;

  const run = async (status: ClassStatus) => {
    if (change.isPending) return;
    setErrors([]);
    try {
      await change.mutateAsync(status);
      setAnnouncement(DONE[status]);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  };

  const toggle: ClassStatus = schoolClass.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={errors} title="Não foi possível alterar a situação" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" aria-busy={change.isPending || undefined} onClick={() => void run(toggle)}>
          {toggle === "INACTIVE" ? "Inativar" : "Reativar"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="danger">
              Arquivar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arquivar a turma {schoolClass.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Os convites pendentes serão cancelados e as matrículas continuam como estão. Uma turma arquivada não
                pode ser editada nem voltar a ficar ativa.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="danger" onClick={() => void run("ARCHIVED")}>Arquivar turma</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
