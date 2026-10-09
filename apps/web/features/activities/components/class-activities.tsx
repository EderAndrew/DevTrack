"use client";

import type { ActivityStatus, PublicationPhase, TeacherActivitySummary } from "@repo/contracts";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Status, type StatusVariant } from "@/components/ui/status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLongDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useClassActivities } from "../hooks/use-activities";
import { ACTIVITY_TYPE_LABELS, activitySituation } from "../schemas/activity-form";
import { WorkOptionBadges } from "./work-options";

const SITUATION_VARIANTS: Record<string, StatusVariant> = {
  Agendada: "info",
  Publicada: "success",
  Encerrada: "neutral",
  Cancelada: "danger",
};

function Situation({ status, phase }: { status: ActivityStatus; phase: PublicationPhase | null }) {
  const label = activitySituation(status, phase);
  return <Status variant={SITUATION_VARIANTS[label]}>{label}</Status>;
}

/**
 * A Trabalho: "12 de 30", the pending grading and the release, in words. An Exercício (013
 * contracts/web-ui.md): "Concluíram: 12 de 30" and "Aguardando correção: 3", with no release.
 */
function Deliveries({ activity }: { activity: TeacherActivitySummary }) {
  const { counts, exerciseCounts } = activity;
  if (exerciseCounts) {
    return (
      <div className="flex flex-col gap-1">
        <span>
          Concluíram: {exerciseCounts.completed} de {counts.enrolled}
        </span>
        {exerciseCounts.pendingMarks > 0 ? <span>Aguardando correção: {exerciseCounts.pendingMarks}</span> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span>
        {counts.submitted + counts.submittedLate} de {counts.enrolled}
      </span>
      {counts.pendingGrading > 0 ? <span>Correção pendente: {counts.pendingGrading}</span> : null}
      {activity.resultReleasedAt ? <span>Resultado liberado</span> : null}
    </div>
  );
}

export interface ClassActivitiesProps {
  classId: string;
  /** `atividades.aplicar` (UX only; the API authorizes). */
  canApply: boolean;
}

/**
 * The class's activities (012 contracts/web-ui.md, `/turmas/[id]/atividades`): título (with a
 * Trabalho's mode and AI help as text, 015/FR-006), tipo, situação in words, prazo, entregas and the
 * action "Nova atividade". Every status is listed, by
 * deadline (latest first), as the API orders them.
 */
export function ClassActivities({ classId, canApply }: ClassActivitiesProps) {
  const query = useClassActivities(classId);
  const newActivity = canApply ? (
    <Button asChild>
      <Link href={`/turmas/${classId}/atividades/nova`}>
        <Plus aria-hidden="true" />
        Nova atividade
      </Link>
    </Button>
  ) : null;

  if (query.isPending) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando as atividades…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert">
        <p>{messageForError(query.error)}</p>
        <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const items = query.data.items;
  return (
    <section aria-labelledby="atividades-titulo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="atividades-titulo" className="m-0 text-h2">
          Atividades
        </h2>
        {items.length > 0 ? newActivity : null}
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma atividade nesta turma."
          description="Aplique um trabalho ou exercícios aprovados do seu banco."
          action={newActivity}
        />
      ) : (
        <Table>
          <TableCaption>Atividades da turma, por prazo (o mais distante primeiro).</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Título</TableHead>
              <TableHead scope="col">Tipo</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Prazo</TableHead>
              <TableHead scope="col">Entregas e conclusões</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((activity) => (
              <TableRow key={activity.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Link href={`/turmas/${classId}/atividades/${activity.id}`}>{activity.title}</Link>
                    <WorkOptionBadges activity={activity} />
                  </div>
                </TableCell>
                <TableCell>{ACTIVITY_TYPE_LABELS[activity.type]}</TableCell>
                <TableCell>
                  <Situation status={activity.status} phase={activity.phase} />
                </TableCell>
                <TableCell>{activity.deadline ? formatLongDateTime(activity.deadline) : "Sem prazo"}</TableCell>
                <TableCell>
                  <Deliveries activity={activity} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export { Situation as ActivitySituation };
