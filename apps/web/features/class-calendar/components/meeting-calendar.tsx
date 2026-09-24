"use client";

import type { ClassMeetingList, ClassMeetingView, TopicResolution } from "@repo/contracts";
import { useMemo, useState } from "react";
import { Notice } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useClassPlan } from "@/features/class-plan/hooks/use-class-plan";
import { useClassMeetings, useUpdateClassMeetings } from "../hooks/use-class-meetings";
import { fromIsoDate, meetingLabel, toIsoDate } from "./calendar-dates";
import { MeetingList } from "./meeting-list";
import { TopicResolutionDialog } from "./topic-resolution-dialog";

export interface MeetingCalendarProps {
  classId: string;
  /** The class period ("YYYY-MM-DD"): the calendar shows only these months and days. */
  startsOn: string;
  endsOn: string;
  /** UX only (`calendario.gerenciar` and a class that is not archived); the API decides. */
  canEdit: boolean;
}

/**
 * Calendário da turma (004/US4, FR-025 – FR-030, FR-052): the teacher marks the days of the
 * period with a class. The total and the numbered list follow the selection, and "Salvar
 * calendário" sends only the dates added and removed, with what was chosen for the topics of the
 * removed days.
 */
export function MeetingCalendar(props: MeetingCalendarProps) {
  const query = useClassMeetings(props.classId);
  const [notice, setNotice] = useState("");

  if (query.isPending) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando…</span>
        <Skeleton className="h-72 w-full" />
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
  return (
    <>
      {notice ? <Notice role="status">{notice}</Notice> : null}
      {/* A saved calendar starts a fresh selection from what the API kept. */}
      <CalendarEditor
        key={query.dataUpdatedAt}
        {...props}
        list={query.data}
        onEdit={() => setNotice("")}
        onSaved={() => setNotice("Calendário salvo.")}
      />
    </>
  );
}

interface CalendarEditorProps extends MeetingCalendarProps {
  list: ClassMeetingList;
  onEdit: () => void;
  onSaved: () => void;
}

function CalendarEditor({ classId, startsOn, endsOn, canEdit, list, onEdit, onSaved }: CalendarEditorProps) {
  const saved = useMemo(() => new Map(list.items.map((meeting) => [meeting.date, meeting])), [list]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(saved.keys()));
  /** Choices for the topics of each saved day being unmarked, by date. */
  const [resolutions, setResolutions] = useState<Record<string, TopicResolution[]>>({});
  const [resolving, setResolving] = useState<ClassMeetingView | null>(null);
  const [error, setError] = useState("");
  // The topics of a day being unmarked (FR-029); a class without a plan has none.
  const plan = useClassPlan(classId, { enabled: list.planRevision !== null }).data?.plan ?? null;
  // An archived plan is read-only (004/US7-6): its days cannot change either.
  const editable = canEdit && plan?.status !== "ARCHIVED";
  const update = useUpdateClassMeetings(classId);

  const start = fromIsoDate(startsOn);
  const end = fromIsoDate(endsOn);
  const dates = [...selected].sort();
  const added = dates.filter((date) => !saved.has(date));
  const removed = [...saved.keys()].filter((date) => !selected.has(date)).sort();

  const change = (next: Set<string>, nextResolutions = resolutions) => {
    setSelected(next);
    setResolutions(nextResolutions);
    setError("");
    onEdit();
  };

  const toggle = (date: string) => {
    const next = new Set(selected);
    if (!selected.has(date)) {
      next.add(date);
      // Marked again: the day stays, so its topics need no resolution.
      const { [date]: _dropped, ...rest } = resolutions;
      change(next, rest);
      return;
    }
    const meeting = saved.get(date);
    if (meeting && meeting.topicCount > 0) {
      setResolving(meeting);
      return;
    }
    next.delete(date);
    change(next);
  };

  const confirmResolutions = (chosen: TopicResolution[]) => {
    const date = resolving!.date;
    const next = new Set(selected);
    next.delete(date);
    change(next, { ...resolutions, [date]: chosen });
    setResolving(null);
  };

  const save = async () => {
    setError("");
    try {
      await update.mutateAsync({
        planRevision: list.planRevision,
        add: added,
        remove: removed,
        resolutions: removed.flatMap((date) => resolutions[date] ?? []),
      });
      onSaved();
    } catch (failure) {
      setError(messageForError(failure));
    }
  };

  const resolvingTopics = resolving ? (plan?.topics ?? []).filter((topic) => topic.meetingId === resolving.id) : [];
  const leaving = new Set(
    Object.values(resolutions)
      .flat()
      .filter((resolution) => resolution.action === "MERGE" || resolution.action === "ARCHIVE")
      .map((resolution) => resolution.topicId),
  );
  // Nothing is merged into a completed topic (004/FR-057).
  const mergeCandidates = (plan?.topics ?? []).filter(
    (topic) => topic.meetingId !== resolving?.id && !leaving.has(topic.id) && topic.status !== "COMPLETED",
  );
  const remaining = dates.filter((date) => date !== resolving?.date);
  const moveTargets = remaining.map((date, index) => ({ date, label: meetingLabel(index + 1, date) }));

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="m-0 font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-10">
        <Calendar
          mode="multiple"
          selected={dates.map(fromIsoDate)}
          onSelect={(_all, day) => (editable ? toggle(toIsoDate(day)) : undefined)}
          disabled={editable ? [{ before: start }, { after: end }] : true}
          startMonth={start}
          endMonth={end}
          defaultMonth={start}
          weekStartsOn={0}
          className="rounded-md border border-border p-5 [--cell-size:--spacing(12)] [&_th]:text-sm [&_td[data-day]]:p-0.5"
        />
        <div className="flex min-w-60 flex-1 flex-col gap-3">
          <p aria-live="polite" className="m-0 font-semibold">
            Total de aulas selecionadas: {dates.length}
          </p>
          <MeetingList dates={dates} />
        </div>
      </div>
      {editable ? (
        <div>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={update.isPending || (added.length === 0 && removed.length === 0)}
          >
            Salvar calendário
          </Button>
        </div>
      ) : null}
      <TopicResolutionDialog
        key={resolving?.id ?? "fechado"}
        meetingDate={resolving?.date ?? null}
        topics={resolvingTopics}
        moveTargets={moveTargets}
        mergeCandidates={mergeCandidates}
        onConfirm={confirmResolutions}
        onCancel={() => setResolving(null)}
      />
    </div>
  );
}
