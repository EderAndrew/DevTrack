"use client";

import type { ClassMeetingList, ClassMeetingView, DayKind, TopicResolution } from "@repo/contracts";
import { type ComponentProps, useMemo, useState } from "react";
import { labelDayButton } from "react-day-picker";
import { Notice } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useClassPlan } from "@/features/class-plan/hooks/use-class-plan";
import { useClassMeetings, useUpdateClassMeetings } from "../hooks/use-class-meetings";
import {
  DAY_KIND_LABELS,
  DAY_KINDS,
  type DayMark,
  isMeetingKind,
  dayKindName,
  marksOf,
  meetingNumbers,
  pendingToRequest,
} from "../schemas/day-kinds";
import { fromIsoDate, meetingLabel, toIsoDate } from "./calendar-dates";
import { DayKindDialog } from "./day-kind-dialog";
import { DayKindIcon, DayKindLegend } from "./day-kind-icon";
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
 * period. 031/US1: activating a day opens "Marcar dia" with the nine kinds; each day shows its kind,
 * the total counts only the encontros, and "Salvar calendário" sends only what changed (`add`, `set`,
 * `remove`), with what was chosen for the topics of the removed days. A day whose class was concluded (a topic of the plan with that `completedOn`,
 * 004/US9) is struck through with a check, in the calendar and in the list (amendment 2026-10-11).
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

const KIND_MODIFIER = (kind: DayKind) => `kind-${kind}`;

/** A day of the calendar with the icon of its kind under the number (031/FR-010); the name says the kind in words. */
function KindDayButton(props: ComponentProps<typeof CalendarDayButton>) {
  const kind = DAY_KINDS.find((option) => props.modifiers[KIND_MODIFIER(option)]);
  return (
    <CalendarDayButton {...props}>
      {props.children}
      {kind ? <DayKindIcon kind={kind} /> : null}
    </CalendarDayButton>
  );
}

function CalendarEditor({ classId, startsOn, endsOn, canEdit, list, onEdit, onSaved }: CalendarEditorProps) {
  const savedMeetings = useMemo(() => new Map(list.items.map((meeting) => [meeting.date, meeting])), [list]);
  const saved = useMemo(() => marksOf(list), [list]);
  /** The marks as they will be saved (031 CK10): date → kind and texts. */
  const [marks, setMarks] = useState<ReadonlyMap<string, DayMark>>(() => new Map(saved));
  /** Choices for the topics of each saved meeting being unmarked, by date. */
  const [resolutions, setResolutions] = useState<Record<string, TopicResolution[]>>({});
  const [editing, setEditing] = useState<string | null>(null);
  /** A saved meeting with topics leaving the meeting condition: unmarked (`mark` null) or changed to another kind. */
  const [resolving, setResolving] = useState<{ meeting: ClassMeetingView; mark: DayMark | null } | null>(null);
  const [error, setError] = useState("");
  // The topics of a day being unmarked (FR-029); a class without a plan has none.
  const plan = useClassPlan(classId, { enabled: list.planRevision !== null }).data?.plan ?? null;
  // An archived plan is read-only (004/US7-6): its days cannot change either.
  const editable = canEdit && plan?.status !== "ARCHIVED";
  const update = useUpdateClassMeetings(classId);

  const start = fromIsoDate(startsOn);
  const end = fromIsoDate(endsOn);
  const request = pendingToRequest(saved, marks);
  const numbers = meetingNumbers(marks);
  const meetingDates = [...numbers.keys()];
  const otherDays = [...marks.keys()].filter((date) => !numbers.has(date)).sort();

  const change = (next: Map<string, DayMark>, nextResolutions = resolutions) => {
    setMarks(next);
    setResolutions(nextResolutions);
    setError("");
    onEdit();
  };

  /** A saved meeting with topics whose topics were not resolved yet in this edit (004/FR-029, 031/FR-008). */
  const needsResolution = (date: string) => {
    const meeting = savedMeetings.get(date);
    return meeting && meeting.topicCount > 0 && resolutions[date] === undefined ? meeting : null;
  };

  const confirmMark = (date: string, mark: DayMark) => {
    setEditing(null);
    if (!isMeetingKind(mark.kind)) {
      // 031/US2: a class with topics changed to Feriado, Recesso, Evento or Falta asks first what to do with them.
      const meeting = needsResolution(date);
      if (meeting) {
        setResolving({ meeting, mark });
        return;
      }
      const next = new Map(marks);
      next.set(date, mark);
      change(next);
      return;
    }
    const next = new Map(marks);
    next.set(date, mark);
    // A class again: the day stays a meeting, so its topics need no resolution.
    const { [date]: _dropped, ...rest } = resolutions;
    change(next, rest);
  };

  const unmark = (date: string) => {
    setEditing(null);
    const meeting = needsResolution(date);
    if (meeting) {
      setResolving({ meeting, mark: null });
      return;
    }
    const next = new Map(marks);
    next.delete(date);
    change(next);
  };

  const confirmResolutions = (chosen: TopicResolution[]) => {
    const { meeting, mark } = resolving!;
    const next = new Map(marks);
    if (mark) next.set(meeting.date, mark);
    else next.delete(meeting.date);
    change(next, { ...resolutions, [meeting.date]: chosen });
    setResolving(null);
  };

  const save = async () => {
    setError("");
    try {
      await update.mutateAsync({
        planRevision: list.planRevision,
        add: request.add,
        // A 004 save (only Aula days) keeps its body without `set`.
        ...(request.set && request.set.length > 0 ? { set: request.set } : {}),
        remove: request.remove,
        // The topics of every saved meeting that stops being one: unmarked, or changed to a kind that is not a class.
        resolutions: Object.keys(resolutions)
          .sort()
          .filter((date) => !isMeetingKind(marks.get(date)?.kind ?? "HOLIDAY"))
          .flatMap((date) => resolutions[date]!),
      });
      onSaved();
    } catch (failure) {
      setError(messageForError(failure));
    }
  };

  const resolvingTopics = resolving
    ? (plan?.topics ?? []).filter((topic) => topic.meetingId === resolving.meeting.id)
    : [];
  const leaving = new Set(
    Object.values(resolutions)
      .flat()
      .filter((resolution) => resolution.action === "MERGE" || resolution.action === "ARCHIVE")
      .map((resolution) => resolution.topicId),
  );
  // Nothing is merged into a completed topic (004/FR-057).
  const mergeCandidates = (plan?.topics ?? []).filter(
    (topic) => topic.meetingId !== resolving?.meeting.id && !leaving.has(topic.id) && topic.status !== "COMPLETED",
  );
  const remaining = meetingDates.filter((date) => date !== resolving?.meeting.date);
  // 004/US9: the days of the plan's concluded classes ("Reabrir aula" clears `completedOn`).
  const completedOn = new Set((plan?.topics ?? []).flatMap((topic) => (topic.completedOn ? [topic.completedOn] : [])));
  const completed = new Set(meetingDates.filter((date) => completedOn.has(date)));
  const moveTargets = remaining.map((date, index) => ({ date, label: meetingLabel(index + 1, date) }));
  const kindModifiers = Object.fromEntries(
    DAY_KINDS.map((kind) => [
      KIND_MODIFIER(kind),
      [...marks].filter(([, mark]) => mark.kind === kind).map(([date]) => fromIsoDate(date)),
    ]),
  );
  const unchanged = request.add.length === 0 && (request.set?.length ?? 0) === 0 && request.remove.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="m-0 font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-10">
        <div className="flex flex-col gap-4">
          <Calendar
            mode="multiple"
            selected={meetingDates.map(fromIsoDate)}
            modifiers={{ done: [...completed].map(fromIsoDate), ...kindModifiers }}
            // Activating a day opens "Marcar dia" (031/FR-003) instead of toggling it.
            onSelect={(_all, day) => (editable ? setEditing(toIsoDate(day)) : undefined)}
            disabled={editable ? [{ before: start }, { after: end }] : true}
            startMonth={start}
            endMonth={end}
            defaultMonth={start}
            weekStartsOn={0}
            components={{ DayButton: KindDayButton }}
            labels={{
              labelDayButton: (date, modifiers, options, dateLib) => {
                const iso = toIsoDate(date);
                const mark = marks.get(iso);
                const kind = mark ? `: ${dayKindName(mark.kind, numbers.get(iso))}` : "";
                return `${labelDayButton(date, modifiers, options, dateLib)}${kind}${modifiers.done ? ", concluído" : ""}`;
              },
            }}
            className="rounded-md border border-border p-5 [--cell-size:--spacing(12)] [&_th]:text-body-sm [&_td[data-day]]:p-1"
          />
          <DayKindLegend />
        </div>
        <div className="flex min-w-60 flex-1 flex-col gap-3">
          <p aria-live="polite" className="m-0 font-semibold">
            Total de aulas selecionadas: {meetingDates.length}
          </p>
          <p aria-live="polite" className="m-0 text-body-sm text-text-secondary">
            Outros dias marcados: {otherDays.length}
          </p>
          <MeetingList
            meetings={meetingDates.map((date) => ({ date, ...marks.get(date)! }))}
            days={otherDays.map((date) => ({ date, ...marks.get(date)! }))}
            completed={completed}
          />
        </div>
      </div>
      {editable ? (
        <div>
          <Button type="button" onClick={() => void save()} disabled={update.isPending || unchanged}>
            Salvar calendário
          </Button>
        </div>
      ) : null}
      <DayKindDialog
        date={editing}
        mark={editing ? (marks.get(editing) ?? null) : null}
        onConfirm={(mark) => confirmMark(editing!, mark)}
        onUnmark={() => unmark(editing!)}
        onCancel={() => setEditing(null)}
      />
      <TopicResolutionDialog
        key={resolving?.meeting.id ?? "fechado"}
        meetingDate={resolving?.meeting.date ?? null}
        nextKindLabel={resolving?.mark ? DAY_KIND_LABELS[resolving.mark.kind] : undefined}
        topics={resolvingTopics}
        moveTargets={moveTargets}
        mergeCandidates={mergeCandidates}
        onConfirm={confirmResolutions}
        onCancel={() => setResolving(null)}
      />
    </div>
  );
}
