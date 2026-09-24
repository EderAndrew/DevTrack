"use client";

import type { ClassPlanView } from "@repo/contracts";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSubjectDocuments } from "@/features/syllabus/hooks/use-syllabus-documents";
import { messageForError } from "@/lib/messages/error-messages";
import { useClassPlan, useSelectPlanSyllabus } from "../hooks/use-class-plan";

const SELECT_CLASS = "min-h-11 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground";

/** Links of non-archived topics to items that are not in the revision the plan uses (E16). */
export const outsideLinks = (plan: ClassPlanView) =>
  plan.topics.reduce((count, topic) => count + topic.items.filter((item) => item.outsideRevision).length, 0);

export interface PlanSyllabusPickerProps {
  classId: string;
  subjectId: string;
  /** UX only (`planejamento.editar` and a class that is not archived); the API decides. */
  canEdit: boolean;
}

/**
 * "Ementa usada pela turma" (004/US5, FR-031, FR-042): the confirmed version the plan uses and the
 * choice among the subject's confirmed versions. Switching keeps the topics and asks first, since
 * items that do not exist in the new version stay flagged in them.
 */
export function PlanSyllabusPicker({ classId, subjectId, canEdit }: PlanSyllabusPickerProps) {
  const planQuery = useClassPlan(classId);
  const documents = useSubjectDocuments(subjectId);
  const select = useSelectPlanSyllabus(classId);
  const [chosen, setChosen] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const plan = planQuery.data?.plan ?? null;
  const options = (documents.data?.items ?? []).flatMap((document) =>
    document.confirmedRevision
      ? [{ id: document.confirmedRevision.id, label: `Versão ${document.version} — revisão ${document.confirmedRevision.number}` }]
      : [],
  );
  const selected = chosen || plan?.syllabus.revisionId || options[0]?.id || "";

  const save = async () => {
    setConfirming(false);
    setError("");
    setStatus("");
    try {
      const saved = await select.mutateAsync(selected);
      const outside = outsideLinks(saved);
      setStatus(
        plan
          ? `Ementa da turma trocada.${outside > 0 ? ` ${outside === 1 ? "1 item de tópico não existe" : `${outside} itens de tópicos não existem`} nesta versão.` : ""}`
          : "A turma agora usa esta ementa.",
      );
    } catch (failure) {
      setError(messageForError(failure));
    }
  };

  return (
    <section aria-labelledby="ementa-usada-titulo" className="mb-6 flex flex-col gap-3">
      <h3 id="ementa-usada-titulo" className="m-0">
        Ementa usada pela turma
      </h3>
      {planQuery.isPending ? null : plan ? (
        <p className="m-0">
          Versão {plan.syllabus.documentVersion}, revisão {plan.syllabus.revisionNumber}.
        </p>
      ) : (
        <p className="m-0">A turma ainda não usa uma ementa. Escolha uma versão confirmada para planejar os tópicos.</p>
      )}
      <p role="status" className="m-0 font-semibold empty:hidden">
        {status}
      </p>
      {error ? (
        <p role="alert" className="m-0 font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      {canEdit && options.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="versao-confirmada">Versão confirmada</Label>
            <select
              id="versao-confirmada"
              className={SELECT_CLASS}
              value={selected}
              onChange={(event) => setChosen(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            disabled={select.isPending || selected === plan?.syllabus.revisionId}
            onClick={() => (plan ? setConfirming(true) : void save())}
          >
            Usar esta versão
          </Button>
        </div>
      ) : null}
      {canEdit && !planQuery.isPending && !documents.isPending && options.length === 0 ? (
        <p className="m-0">Nenhuma versão da ementa foi confirmada ainda.</p>
      ) : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar a ementa usada pela turma?</AlertDialogTitle>
            <AlertDialogDescription>
              Os tópicos são mantidos. Os itens da ementa que não existem na nova versão continuam nos tópicos, marcados
              como fora da versão usada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void save()}>Trocar ementa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
