"use client";

import type { CohortStatus, CohortView } from "@repo/contracts";
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
import { useChangeCohortStatus } from "../hooks/use-cohorts";

const DONE: Record<CohortStatus, string> = {
  ACTIVE: "Turma reativada.",
  INACTIVE: "Turma encerrada.",
  ARCHIVED: "Turma arquivada.",
};

/**
 * Situation of a turma (027/FR-004, FR-005; contracts/ui.md): "Encerrar" (inactive) or "Reativar", and "Arquivar"
 * after a confirmation, since it is final and cancels the pending invitations. An archived turma offers nothing;
 * the API checks every transition again.
 */
export function CohortStatusActions({ cohort }: { cohort: CohortView }) {
  const change = useChangeCohortStatus(cohort.id);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const run = async (to: CohortStatus) => {
    if (change.isPending) return;
    setErrors([]);
    try {
      await change.mutateAsync(to);
      setAnnouncement(DONE[to]);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  };

  const toggle: CohortStatus = cohort.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={errors} title="Não foi possível alterar a situação" />
      {cohort.status === "ARCHIVED" ? null : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" aria-busy={change.isPending || undefined} onClick={() => void run(toggle)}>
            {toggle === "INACTIVE" ? "Encerrar" : "Reativar"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="danger">
                Arquivar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Arquivar a turma {cohort.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os convites pendentes serão cancelados. As matrículas e as disciplinas da turma continuam como estão.
                  Uma turma arquivada não pode ser editada nem voltar a ficar ativa.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="danger" onClick={() => void run("ARCHIVED")}>
                  Arquivar turma
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
