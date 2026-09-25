"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useClass } from "@/features/classes/hooks/use-classes";
import { messageForError } from "@/lib/messages/error-messages";
import { useClassPlan, useSelectPlanSyllabus } from "../hooks/use-class-plan";

export interface SyllabusForClassDialogProps {
  /** The class the teacher came from (`?turma=`). */
  classId: string;
  /** The revision just confirmed. */
  revisionId: string;
}

/**
 * After "Conteúdo confirmado." on a version opened from a class (004/US2-1, FR-006): when that
 * class does not use a syllabus yet, "Usar esta ementa na turma <nome>?" selects the confirmed
 * content for its plan. A class that already uses one switches from its Ementa page instead.
 */
export function SyllabusForClassDialog({ classId, revisionId }: SyllabusForClassDialogProps) {
  const schoolClass = useClass(classId);
  const plan = useClassPlan(classId);
  const select = useSelectPlanSyllabus(classId);
  const [dismissed, setDismissed] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const name = schoolClass.data?.name;
  const open = !dismissed && !done && name !== undefined && plan.data?.plan === null;

  const use = async () => {
    setError("");
    try {
      await select.mutateAsync(revisionId);
      setDone(true);
    } catch (failure) {
      setDismissed(true);
      setError(messageForError(failure));
    }
  };

  return (
    <>
      {done ? (
        <p role="status" className="font-semibold">
          A turma {name} agora usa esta ementa. <Link href={`/turmas/${classId}/planejamento`}>Ir para o planejamento</Link>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
      <AlertDialog open={open} onOpenChange={(next) => setDismissed(!next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usar esta ementa na turma {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os tópicos do planejamento da turma serão ligados aos itens deste conteúdo confirmado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Agora não</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void use();
              }}
            >
              Usar ementa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
