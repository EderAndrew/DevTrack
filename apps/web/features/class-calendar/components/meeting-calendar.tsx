"use client";

import type { ClassMeetingList, ClassMeetingView, DayKind, TopicResolution } from "@repo/contracts";
import { Info, Save } from "lucide-react";
import { type ComponentProps, createContext, useContext, useMemo, useState } from "react";
import { labelDayButton, type MonthCaptionProps } from "react-day-picker";
import { Notice } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { cn } from "@/lib/utils";
import { useClassPlan } from "@/features/class-plan/hooks/use-class-plan";
import { useClassMeetings, useUpdateClassMeetings } from "../hooks/use-class-meetings";
import {
  CALENDAR_HINT,
  DAY_KIND_LABELS,
  DAY_KINDS,
  type DayMark,
  dayKindName,
  doneCountLabel,
  ICON_CLASSES,
  isMeetingKind,
  marksOf,
  MEETING_LIST_TITLE,
  meetingNumbers,
  meetingsSelectedWords,
  MONTH_HINT,
  OTHER_DAYS_LABEL,
  pendingLabel,
  pendingToRequest,
  SAVE_CALENDAR,
  SAVE_HINT,
  scheduledCountLabel,
  TODAY_LABEL,
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

/** What a day of the grid shows beyond its modifiers: the numbers of the encontros and whether days can be chosen. */
const DayInfo = createContext<{ numbers: ReadonlyMap<string, number>; editable: boolean }>({
  numbers: new Map(),
  editable: false,
});

const DAY_CELL = cn(
  "aspect-auto h-14 min-w-0 items-start justify-between gap-1 rounded-md bg-muted p-2 text-left sm:h-20",
  "group-data-[today=true]/day:border group-data-[today=true]/day:border-foreground",
  "data-[selected-single=true]:bg-primary-subtle data-[selected-single=true]:text-foreground",
  "[&>svg[data-done]]:absolute [&>svg[data-done]]:top-2 [&>svg[data-done]]:right-2",
);

/**
 * A day of the calendar (031/FR-010): its number, and under it the icon and name of its kind ("Hoje" on today's unmarked
 * day); the day last chosen is filled and names its class number. The button's accessible name says the kind in words.
 */
function KindDayButton({ className, ...props }: ComponentProps<typeof CalendarDayButton>) {
  const { numbers } = useContext(DayInfo);
  const kind = DAY_KINDS.find((option) => props.modifiers[KIND_MODIFIER(option)]);
  const current = Boolean(props.modifiers.current);
  const number = numbers.get(toIsoDate(props.day.date));
  return (
    <CalendarDayButton
      {...props}
      className={cn(
        className,
        DAY_CELL,
        "relative",
        current && "bg-primary text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
      )}
    >
      <div className="text-body font-medium">{props.children}</div>
      {kind ? (
        <div className="flex w-full min-w-0 items-center gap-1 text-caption">
          <DayKindIcon kind={kind} className={cn("size-3", current ? undefined : ICON_CLASSES[kind])} />
          <span className="hidden truncate md:inline">
            {current && number ? `${DAY_KIND_LABELS[kind]} ${number}` : DAY_KIND_LABELS[kind]}
          </span>
        </div>
      ) : props.modifiers.today ? (
        <div className="hidden text-caption text-text-secondary md:block">{TODAY_LABEL}</div>
      ) : null}
    </CalendarDayButton>
  );
}

/** "Novembro 2026" and the hint, on the left of the month's arrows; the picker's own caption stays for screen readers. */
function MonthCaption({ calendarMonth, displayIndex: _index, children, ...props }: MonthCaptionProps) {
  const { editable } = useContext(DayInfo);
  const month = calendarMonth.date.toLocaleString("pt-BR", { month: "long" });
  return (
    <div {...props}>
      {children}
      <p aria-hidden="true" className="m-0 flex items-baseline gap-2">
        <span className="text-h3">{month.charAt(0).toUpperCase() + month.slice(1)}</span>
        <span className="text-body text-text-secondary">{calendarMonth.date.getFullYear()}</span>
      </p>
      {editable ? <p className="m-0 text-body-sm text-text-secondary">{MONTH_HINT}</p> : null}
    </div>
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
  /** The day last opened in "Marcar dia", highlighted in the calendar and in the list. */
  const [current, setCurrent] = useState<string | null>(null);
  const [month, setMonth] = useState(() => fromIsoDate(startsOn));
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

  const pendingCount = request.add.length + (request.set?.length ?? 0) + request.remove.length;
  const doneCount = completed.size;
  const open = (date: string) => {
    setCurrent(date);
    setEditing(date);
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="m-0 font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="m-0 text-body text-text-secondary">{editable ? CALENDAR_HINT : null}</p>
        <p
          aria-live="polite"
          className="m-0 flex items-center gap-3 rounded-md border border-border bg-card px-5 py-3 text-body-sm"
        >
          <span className="text-h2 text-primary">{meetingDates.length}</span>{" "}
          {meetingsSelectedWords(meetingDates.length)}
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-0 px-4 py-5 sm:px-6">
            <DayInfo.Provider value={{ numbers, editable }}>
              <Calendar
                mode="multiple"
                selected={meetingDates.map(fromIsoDate)}
                modifiers={{
                  done: [...completed].map(fromIsoDate),
                  current: current ? [fromIsoDate(current)] : [],
                  ...kindModifiers,
                }}
                // Activating a day opens "Marcar dia" (031/FR-003) instead of toggling it.
                onSelect={(_all, day) => (editable ? open(toIsoDate(day)) : undefined)}
                disabled={editable ? [{ before: start }, { after: end }] : true}
                month={month}
                onMonthChange={setMonth}
                startMonth={start}
                endMonth={end}
                weekStartsOn={0}
                components={{ DayButton: KindDayButton, MonthCaption }}
                labels={{
                  labelDayButton: (date, modifiers, options, dateLib) => {
                    const iso = toIsoDate(date);
                    const mark = marks.get(iso);
                    const kind = mark ? `: ${dayKindName(mark.kind, numbers.get(iso))}` : "";
                    return `${labelDayButton(date, modifiers, options, dateLib)}${kind}${modifiers.done ? ", concluído" : ""}`;
                  },
                }}
                classNames={{
                  root: "w-full",
                  months: "relative flex w-full flex-col",
                  month: "flex w-full flex-col gap-5",
                  nav: "absolute top-0 right-0 flex items-center gap-2",
                  button_previous: cn(buttonVariants({ variant: "outline" }), "size-11 p-0 aria-disabled:opacity-50"),
                  button_next: cn(buttonVariants({ variant: "outline" }), "size-11 p-0 aria-disabled:opacity-50"),
                  month_caption: "flex min-h-11 flex-col items-start gap-1 pr-16",
                  caption_label: "sr-only",
                  month_grid: "w-full table-fixed border-collapse",
                  weekdays: "",
                  weekday: "pb-2 text-caption font-medium text-text-secondary uppercase",
                  week: "",
                  day: "group/day relative p-1 text-center select-none",
                  today: "",
                  outside: "text-muted-foreground",
                  disabled: "text-muted-foreground opacity-50",
                  hidden: "invisible",
                }}
                className="w-full bg-transparent p-0"
              />
            </DayInfo.Provider>
          </Card>
          <DayKindLegend />
        </div>
        <Card className="min-w-0 gap-4 px-2 py-5 sm:px-3">
          <div className="flex flex-col gap-3 px-3">
            <div className="flex items-center justify-between gap-4">
              <h3 className="m-0 text-h3">{MEETING_LIST_TITLE}</h3>
              <span aria-hidden="true" className="text-h3 text-primary">
                {meetingDates.length}
              </span>
            </div>
            {meetingDates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">{doneCountLabel(doneCount)}</Badge>
                <Badge>{scheduledCountLabel(meetingDates.length - doneCount)}</Badge>
              </div>
            ) : null}
          </div>
          <MeetingList
            meetings={meetingDates.map((date) => ({ date, ...marks.get(date)! }))}
            days={otherDays.map((date) => ({ date, ...marks.get(date)! }))}
            completed={completed}
            current={current}
          />
          <p
            aria-live="polite"
            className="m-0 mx-3 flex items-center justify-between gap-4 border-t border-border pt-4 text-body-sm text-text-secondary"
          >
            <span>
              {OTHER_DAYS_LABEL}
              <span className="sr-only">:</span>
            </span>{" "}
            <span className="font-semibold text-foreground">{otherDays.length}</span>
          </p>
        </Card>
      </div>
      {editable ? (
        <Card className="flex-row flex-wrap items-center gap-4 px-6 py-4">
          <Info aria-hidden="true" className="size-5 shrink-0 text-text-secondary" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p aria-live="polite" className="m-0 font-medium">
              {pendingLabel(pendingCount)}
            </p>
            <p className="m-0 text-body-sm text-text-secondary">{SAVE_HINT}</p>
          </div>
          <Button type="button" onClick={() => void save()} disabled={update.isPending || unchanged}>
            <Save aria-hidden="true" />
            {SAVE_CALENDAR}
          </Button>
        </Card>
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
