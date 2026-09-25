"use client";

import type { ClassPlanStatus, ClassPlanView, PlanStatusAction } from "@repo/contracts";
import { useState } from "react";
import { Notice } from "@/components/shared";
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
import { CLASS_PLAN_STATUS_LABELS } from "@/lib/messages/status-labels";
import { useChangePlanStatus } from "../hooks/use-class-plan";

/** The actions offered in each status (the API's state machine decides). */
const ACTIONS: Record<ClassPlanStatus, readonly Exclude<PlanStatusAction, "ARCHIVE">[]> = {
  DRAFT: ["CONFIRM"],
  READY: ["REOPEN", "START"],
  ACTIVE: [],
  ARCHIVED: [],
};

const LABELS: Record<PlanStatusAction, { button: string; done: string }> = {
  CONFIRM: { button: "Confirmar planejamento", done: "Planejamento confirmado." },
  REOPEN: { button: "Reabrir", done: "Planejamento reaberto." },
  START: { button: "Iniciar", done: "Planejamento iniciado." },
  ARCHIVE: { button: "Arquivar planejamento", done: "Planejamento arquivado." },
};

export interface PlanStatusBarProps {
  classId: string;
  plan: ClassPlanView;
  /** UX only (`planejamento.alterar_situacao` and a class that is not archived). */
  canChange: boolean;
}

/**
 * The plan's status and its transitions (004/US7, FR-031): "Confirmar planejamento" (the DRAFT
 * topics become active), "Reabrir", "Iniciar" and "Arquivar planejamento", confirmed in an
 * alert-dialog since it is final. An archived plan is read-only.
 */
export function PlanStatusBar({ classId, plan, canChange }: PlanStatusBarProps) {
  const change = useChangePlanStatus(classId);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const run = async (action: PlanStatusAction) => {
    setStatus("");
    setError("");
    try {
      await change.mutateAsync(action);
      setStatus(LABELS[action].done);
    } catch (failure) {
      setError(messageForError(failure));
    }
  };

  const archived = plan.status === "ARCHIVED";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 font-semibold">Situação: {CLASS_PLAN_STATUS_LABELS[plan.status]}</p>
        {canChange && !archived
          ? ACTIONS[plan.status].map((action) => (
              <Button key={action} type="button" variant="secondary" disabled={change.isPending} onClick={() => void run(action)}>
                {LABELS[action].button}
              </Button>
            ))
          : null}
        {canChange && !archived ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="danger" disabled={change.isPending}>
                Arquivar planejamento
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Arquivar o planejamento?</AlertDialogTitle>
                <AlertDialogDescription>
                  O planejamento arquivado fica somente leitura: tópicos, aulas e ementa usada não poderão mais ser alterados, e
                  ele não volta a outra situação.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="danger" onClick={() => void run("ARCHIVE")}>Arquivar planejamento</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
      {archived ? <Notice className="mb-0">Este planejamento está arquivado e não pode ser alterado.</Notice> : null}
      <p role="status" className="m-0 font-semibold empty:hidden">
        {status}
      </p>
      {error ? (
        <p role="alert" className="m-0 font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
