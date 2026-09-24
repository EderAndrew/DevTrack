"use client";

import type { ClassPlanStatus, ClassPlanView } from "@repo/contracts";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useClassPlan, useClassPlanCoverage } from "../hooks/use-class-plan";
import { CoveragePanel } from "./coverage-panel";
import { MeetingTopics } from "./meeting-topics";
import { TopicFormDialog } from "./topic-form-dialog";
import { UnscheduledTopics } from "./unscheduled-topics";

export const PLAN_STATUS_LABELS: Record<ClassPlanStatus, string> = {
  DRAFT: "Rascunho",
  READY: "Pronto",
  ACTIVE: "Em andamento",
  ARCHIVED: "Arquivado",
};

function Loading({ label }: { label: string }) {
  return (
    <div aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export interface ClassPlanPageProps {
  classId: string;
  /** UX only (`planejamento.editar` and a class that is not archived); the API decides. */
  canEdit: boolean;
}

/**
 * Planejamento da turma (004/US5): the syllabus in use, each class day with its topics, "Sem
 * data", "Novo tópico" and the coverage of the syllabus. Without a selected syllabus there is no
 * plan, and the page leads to the class's Ementa (FR-032).
 */
export function ClassPlanPage({ classId, canEdit }: ClassPlanPageProps) {
  const query = useClassPlan(classId);

  if (query.isPending) return <Loading label="Carregando planejamento…" />;
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
  const { plan } = query.data;
  if (!plan) {
    return (
      <Notice>
        <p className="mt-0">Envie e confirme a ementa antes de criar tópicos.</p>
        <Link href={`/turmas/${classId}/ementa`}>Ir para a ementa da turma</Link>
      </Notice>
    );
  }
  return <PlanBoard classId={classId} plan={plan} canEdit={canEdit && plan.status !== "ARCHIVED"} />;
}

interface TopicDialogState {
  /** Remounts the form, so each opening starts from its own values. */
  key: number;
  open: boolean;
  initial?: { title: string; itemIds: string[] };
}

function PlanBoard({ classId, plan, canEdit }: { classId: string; plan: ClassPlanView; canEdit: boolean }) {
  const coverage = useClassPlanCoverage(classId, true);
  const [dialog, setDialog] = useState<TopicDialogState>({ key: 0, open: false });
  const [announcement, setAnnouncement] = useState("");

  const openForm = (initial?: TopicDialogState["initial"]) => {
    setAnnouncement("");
    setDialog({ key: dialog.key + 1, open: true, initial });
  };
  const unscheduled = plan.topics.filter((topic) => topic.meetingId === null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="m-0">
          Ementa usada: versão {plan.syllabus.documentVersion}, revisão {plan.syllabus.revisionNumber}.
        </p>
        <p className="m-0 font-semibold">Situação: {PLAN_STATUS_LABELS[plan.status]}</p>
        {plan.archivedTopicCount > 0 ? <p className="m-0">Tópicos arquivados: {plan.archivedTopicCount}</p> : null}
      </div>
      <p role="status" className="m-0 font-semibold empty:hidden">
        {announcement}
      </p>
      {canEdit ? (
        <div>
          <Button type="button" onClick={() => openForm()}>
            <Plus aria-hidden="true" />
            Novo tópico
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="aulas-titulo" className="flex flex-col gap-4">
        <h2 id="aulas-titulo">Aulas</h2>
        {plan.meetings.length === 0 ? (
          <p className="m-0">
            Nenhuma aula marcada. <Link href={`/turmas/${classId}/calendario`}>Marcar aulas no calendário</Link>
          </p>
        ) : (
          plan.meetings.map((meeting) => (
            <MeetingTopics
              key={meeting.id}
              meeting={meeting}
              topics={plan.topics.filter((topic) => topic.meetingId === meeting.id)}
            />
          ))
        )}
      </section>
      <UnscheduledTopics topics={unscheduled} />

      {coverage.isPending ? (
        <Loading label="Carregando cobertura da ementa…" />
      ) : coverage.isError ? (
        <div role="alert">
          <p>{messageForError(coverage.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void coverage.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <CoveragePanel
          coverage={coverage.data}
          topics={plan.topics}
          canEdit={canEdit}
          onCreateFromItem={(item) => openForm({ title: item.text, itemIds: [item.id] })}
        />
      )}

      {dialog.key > 0 ? (
        <TopicFormDialog
          key={dialog.key}
          classId={classId}
          open={dialog.open}
          onOpenChange={(open) => setDialog({ ...dialog, open })}
          meetings={plan.meetings}
          groups={coverage.data?.groups ?? []}
          initial={dialog.initial}
          onSaved={setAnnouncement}
        />
      ) : null}
    </div>
  );
}
