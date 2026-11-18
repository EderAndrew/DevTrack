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
  ACTIVE: "Disciplina da turma reativada.",
  INACTIVE: "Disciplina da turma encerrada.",
  ARCHIVED: "Disciplina da turma arquivada.",
};

/**
 * Status actions of a disciplina da turma (027/FR-022), offered by `ClassDetails` only after the calendar's last day:
 * "Encerrar disciplina"/"Reativar" on its own status, and "Arquivar disciplina" after a confirmation, since it is
 * final. The turma and its other disciplinas never change; the API checks the date and every transition again.
 */
export function ClassStatusActions({ schoolClass }: { schoolClass: ClassView }) {
  const change = useChangeClassStatus(schoolClass.id);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");

  if (schoolClass.ownStatus === "ARCHIVED") return null;

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

  const toggle: ClassStatus = schoolClass.ownStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const name = schoolClass.subject?.name ?? "a disciplina";

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={errors} title="Não foi possível alterar a situação" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" aria-busy={change.isPending || undefined} onClick={() => void run(toggle)}>
          {toggle === "INACTIVE" ? "Encerrar disciplina" : "Reativar"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="danger">
              Arquivar disciplina
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Arquivar {name} da turma {schoolClass.cohort.name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                A disciplina da turma deixa de aceitar novas atividades e alterações e continua disponível para
                consulta. A turma e as outras disciplinas dela não mudam. Arquivar não pode ser desfeito.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="danger" onClick={() => void run("ARCHIVED")}>
                Arquivar disciplina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
