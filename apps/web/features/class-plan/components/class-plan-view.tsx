"use client";

import type { ClassPlanView, TopicView } from "@repo/contracts";
import { Merge, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { meetingLabel } from "@/features/class-calendar/components/calendar-dates";
import { todayIsoDate } from "@/lib/messages/dates";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import {
  useArchiveTopic,
  useClassPlan,
  useClassPlanCoverage,
  useCompleteTopic,
  useRefreshPlan,
  useReopenTopic,
  useReorderTopics,
  useRestoreTopic,
} from "../hooks/use-class-plan";
import { ArchivedTopics } from "./archived-topics";
import { CoveragePanel } from "./coverage-panel";
import { MeetingTopics, type RenderTopicActions } from "./meeting-topics";
import { MergeTopicsDialog } from "./merge-topics-dialog";
import { PlanStatusBar } from "./plan-status-bar";
import { SplitTopicDialog } from "./split-topic-dialog";
import { moveButtonId, TopicActions } from "./topic-actions";
import { TopicFormDialog } from "./topic-form-dialog";
import { UnscheduledTopics } from "./unscheduled-topics";

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
  /** UX only (`planejamento.alterar_situacao` and a class that is not archived). */
  canChangeStatus?: boolean;
}

/**
 * Planejamento da turma (004/US5): the syllabus in use, each class day with its topics, "Sem
 * data", "Novo tópico" and the coverage of the syllabus. Without a selected syllabus there is no
 * plan, and the page leads to the class's Ementa (FR-032).
 */
export function ClassPlanPage({ classId, canEdit, canChangeStatus = false }: ClassPlanPageProps) {
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
  return (
    <PlanBoard
      classId={classId}
      plan={plan}
      canEdit={canEdit && plan.status !== "ARCHIVED"}
      canChangeStatus={canChangeStatus}
    />
  );
}

type DialogState =
  | { kind: "create"; initial?: { title: string; itemIds: string[] } }
  | { kind: "edit"; topic: TopicView }
  | { kind: "merge"; topics: TopicView[] }
  | { kind: "split"; topic: TopicView };

interface PlanBoardProps {
  classId: string;
  plan: ClassPlanView;
  canEdit: boolean;
  canChangeStatus: boolean;
}

function PlanBoard({ classId, plan, canEdit, canChangeStatus }: PlanBoardProps) {
  const coverage = useClassPlanCoverage(classId, true);
  const reorder = useReorderTopics(classId);
  const archive = useArchiveTopic(classId);
  const restore = useRestoreTopic(classId);
  const complete = useCompleteTopic(classId);
  const reopen = useReopenTopic(classId);
  const refresh = useRefreshPlan(classId);
  /** `key` remounts the dialog, so each opening starts from its own values. */
  const [dialog, setDialog] = useState<{ key: number; open: boolean; state: DialogState }>({
    key: 0,
    open: false,
    state: { kind: "create" },
  });
  const [announcement, setAnnouncement] = useState("");
  const [failure, setFailure] = useState<{ message: string; conflict: boolean } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** After "Subir"/"Descer", focus stays on the moved topic once the list is redrawn. */
  const pendingFocus = useRef<{ topicId: string; direction: "up" | "down" } | null>(null);
  const busy = reorder.isPending || archive.isPending || restore.isPending || complete.isPending || reopen.isPending;

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const wanted = document.getElementById(moveButtonId(pending.direction, pending.topicId)) as HTMLButtonElement | null;
    const other = document.getElementById(
      moveButtonId(pending.direction === "up" ? "down" : "up", pending.topicId),
    ) as HTMLButtonElement | null;
    (wanted && !wanted.disabled ? wanted : other)?.focus();
  }, [plan]);

  const open = (state: DialogState) => {
    setAnnouncement("");
    setFailure(null);
    setDialog({ key: dialog.key + 1, open: true, state });
  };

  /** Runs a plan write from the page; errors show above the list with "Atualizar" on a conflict. */
  const run = async (write: () => Promise<unknown>, message: string) => {
    setAnnouncement("");
    setFailure(null);
    try {
      await write();
      setAnnouncement(message);
      return true;
    } catch (error) {
      setFailure({ message: messageForError(error), conflict: apiErrorCode(error) === "PLAN_REVISION_CONFLICT" });
      return false;
    }
  };

  const order = (change: (topics: TopicView[]) => TopicView[]) =>
    change([...plan.topics]).map((topic) => ({ topicId: topic.id, meetingId: topic.meetingId }));

  /** Swaps the topic with its neighbour in the same list (its meeting or "Sem data"). */
  const move = async (topic: TopicView, direction: "up" | "down") => {
    const group = plan.topics.filter((other) => other.meetingId === topic.meetingId);
    const index = group.findIndex((other) => other.id === topic.id);
    const neighbour = group[direction === "up" ? index - 1 : index + 1];
    if (!neighbour) return;
    const items = order((topics) => {
      const a = topics.findIndex((other) => other.id === topic.id);
      const b = topics.findIndex((other) => other.id === neighbour.id);
      [topics[a], topics[b]] = [topics[b]!, topics[a]!];
      return topics;
    });
    const position = (direction === "up" ? index - 1 : index + 1) + 1;
    // Set before the write: the plan in the cache changes as soon as it succeeds.
    pendingFocus.current = { topicId: topic.id, direction };
    if (!(await run(() => reorder.mutateAsync(items), `Tópico movido para a posição ${position}.`))) pendingFocus.current = null;
  };

  const changeMeeting = (topic: TopicView, meetingId: string | null) => {
    const meeting = plan.meetings.find((entry) => entry.id === meetingId);
    const items = order((topics) => topics.map((other) => (other.id === topic.id ? { ...other, meetingId } : other)));
    void run(
      () => reorder.mutateAsync(items),
      meeting ? `Tópico movido para a ${meetingLabel(meeting.number, meeting.date)}.` : "Tópico movido para Sem data.",
    );
  };

  const toggleSelected = (topicId: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(topicId);
    else next.delete(topicId);
    setSelected(next);
  };
  const selectedTopics = plan.topics.filter((topic) => selected.has(topic.id) && topic.status !== "COMPLETED");

  /** "Concluir aula" (004/US9): an active topic of a plan in progress whose class day has come (the API decides). */
  const today = todayIsoDate();
  const completable = (topic: TopicView) => {
    const meeting = plan.meetings.find((entry) => entry.id === topic.meetingId);
    return plan.status === "ACTIVE" && topic.status === "ACTIVE" && meeting !== undefined && meeting.date <= today;
  };
  /** Whether the neighbour in the topic's list (its meeting or "Sem data") is completed, so they cannot swap (FR-057). */
  const neighbourCompleted = (topic: TopicView, offset: -1 | 1) => {
    const group = plan.topics.filter((other) => other.meetingId === topic.meetingId);
    return group[group.findIndex((other) => other.id === topic.id) + offset]?.status === "COMPLETED";
  };

  const renderActions: RenderTopicActions | undefined = canEdit
    ? (topic, index, count) => (
        <TopicActions
          topic={topic}
          meetings={plan.meetings}
          index={index}
          count={count}
          selected={selected.has(topic.id)}
          busy={busy}
          completable={completable(topic)}
          lockedUp={neighbourCompleted(topic, -1)}
          lockedDown={neighbourCompleted(topic, 1)}
          onComplete={() => void run(() => complete.mutateAsync(topic.id), "Aula concluída.")}
          onReopen={() => void run(() => reopen.mutateAsync(topic.id), "Aula reaberta.")}
          onEdit={() => open({ kind: "edit", topic })}
          onSplit={() => open({ kind: "split", topic })}
          onArchive={() => void run(() => archive.mutateAsync(topic.id), "Tópico arquivado.")}
          onMove={(direction) => void move(topic, direction)}
          onMeetingChange={(meetingId) => changeMeeting(topic, meetingId)}
          onSelect={(on) => toggleSelected(topic.id, on)}
        />
      )
    : undefined;

  const unscheduled = plan.topics.filter((topic) => topic.meetingId === null);
  const groups = coverage.data?.groups ?? [];
  const common = {
    classId,
    open: dialog.open,
    onOpenChange: (next: boolean) => setDialog({ ...dialog, open: next }),
    meetings: plan.meetings,
    groups,
    onSaved: (message: string) => {
      setAnnouncement(message);
      if (dialog.state.kind === "merge") setSelected(new Set());
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="m-0">
          Ementa usada: versão {plan.syllabus.documentVersion}, revisão {plan.syllabus.revisionNumber}.
        </p>
        {plan.archivedTopicCount > 0 ? <p className="m-0">Tópicos arquivados: {plan.archivedTopicCount}</p> : null}
      </div>
      <PlanStatusBar classId={classId} plan={plan} canChange={canChangeStatus} />
      <p role="status" className="m-0 font-semibold empty:hidden">
        {announcement}
      </p>
      {failure ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="m-0 font-semibold text-destructive">{failure.message}</p>
          {failure.conflict ? (
            <Button type="button" variant="secondary" onClick={() => void refresh().then(() => setFailure(null))}>
              Atualizar
            </Button>
          ) : null}
        </div>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => open({ kind: "create" })}>
            <Plus aria-hidden="true" />
            Novo tópico
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={selectedTopics.length < 2}
            onClick={() => open({ kind: "merge", topics: selectedTopics })}
          >
            <Merge aria-hidden="true" />
            Juntar tópicos ({selectedTopics.length})
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
              renderActions={renderActions}
            />
          ))
        )}
      </section>
      <UnscheduledTopics topics={unscheduled} renderActions={renderActions} />

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
          onCreateFromItem={(item) => open({ kind: "create", initial: { title: item.text, itemIds: [item.id] } })}
        />
      )}

      <ArchivedTopics
        classId={classId}
        count={plan.archivedTopicCount}
        topics={plan.topics}
        canEdit={canEdit}
        busy={busy}
        onRestore={(topic) => void run(() => restore.mutateAsync(topic.id), "Tópico restaurado.")}
      />

      {dialog.key > 0 && dialog.state.kind === "split" ? (
        <SplitTopicDialog key={dialog.key} {...common} topic={dialog.state.topic} />
      ) : dialog.key > 0 && dialog.state.kind === "merge" ? (
        <MergeTopicsDialog key={dialog.key} {...common} topics={dialog.state.topics} />
      ) : dialog.key > 0 ? (
        <TopicFormDialog
          key={dialog.key}
          {...common}
          initial={dialog.state.kind === "create" ? dialog.state.initial : undefined}
          topic={dialog.state.kind === "edit" ? dialog.state.topic : undefined}
        />
      ) : null}
    </div>
  );
}
