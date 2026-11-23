"use client";

import type { ExamOccurrenceView, StudentHistoryItem, StudentHistoryPage, StudentPause } from "@repo/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Clock, FileText, History, Info, type LucideIcon, MessageSquareText, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Status } from "@/components/ui/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration, NO_EXAM_OCCURRENCES, OCCURRENCE_KIND_LABELS, occurredAt } from "@/features/activities/schemas/attempt-records";
import { NO_RETURN, PAUSE_REASON_LABELS, ROOM_EXITS_TITLE } from "@/features/attendance/schemas/attendance";
import { myClassesKeys, useMyClasses } from "@/features/my-classes/hooks/use-my-classes";
import { mySubjectClasses } from "@/features/my-classes/schemas/my-classes";
import { formatDayMonth, formatTime, formatWeekdayTime } from "@/lib/messages/dates";
import { type StudentHistoryFilters, toApiError } from "../api/student-activities";
import { useOwnIntegrity, useStudentHistory } from "../hooks/use-student-activities";
import {
  ALL_SUBJECTS,
  AWAITING_GRADE,
  CLEAR_FILTERS,
  HISTORY_CAPTION,
  HISTORY_CARDS,
  HISTORY_EMPTY,
  HISTORY_FINAL_NOTE,
  HISTORY_LOADING,
  HISTORY_ORDER,
  HISTORY_SEARCH_LABEL,
  HISTORY_SEARCH_PLACEHOLDER,
  HISTORY_SEARCH_WAIT_MS,
  historyClassLines,
  historyDate,
  historyFiltered,
  historyFooter,
  historyGradePercent,
  historyPoints,
  historyStatusLabel,
  historyStatusVariant,
  HISTORY_TABS,
  historyHref,
  historyTabName,
  historyTabOf,
  NO_MATCH,
  twoDigits,
  VIEW_ACTIVITY,
} from "../schemas/student-history";
import { ACTIVITY_TYPE_LABELS, activityHref, formatGrade, SUBJECT_LABEL, SUBJECT_UNAVAILABLE, subjectOptions } from "../schemas/student-activity";
import { LoadFailed, Loading } from "./load-states";

export { HISTORY_EMPTY };
/** 015/US5-2: what the teacher sees of the student's screen exits, told to the student too. */
export const SCREEN_EXITS_NOTE = "O professor vê estes registros. Uma saída não significa, sozinha, uso indevido.";
export const screenExitsLabel = (count: number) => `Saídas da tela registradas: ${count}`;

const ALL: StudentHistoryFilters = { tab: null, q: "", classId: null };

/** The tabs with their counts (028/US2-1), each named with its count ("Aguardando, 3"); arrows move between them. */
function HistoryTabList({ counts }: { counts: StudentHistoryPage["tabCounts"] }) {
  return (
    <TabsList aria-label="Situação das entregas">
      {HISTORY_TABS.map((spec) => (
        <TabsTrigger key={spec.slug} value={spec.slug} aria-label={historyTabName(spec.label, counts[spec.count])}>
          {spec.label}
          <Badge aria-hidden="true">{counts[spec.count]}</Badge>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

interface SummaryCardSpec {
  /** The cards are the deliveries; `totals.missed` is never a card (028 HI12). */
  key: Exclude<keyof StudentHistoryPage["totals"], "missed">;
  icon: LucideIcon;
  tone: string;
  captionTone: string;
}

const CARDS: SummaryCardSpec[] = [
  { key: "delivered", icon: FileText, tone: "bg-primary-subtle text-primary", captionTone: "text-text-secondary" },
  { key: "awaiting", icon: Clock, tone: "bg-warning-surface text-warning-text", captionTone: "text-text-secondary" },
  { key: "graded", icon: Check, tone: "bg-success-surface text-success-text", captionTone: "text-success-text" },
];

/** The three totals of every delivery (028/FR-003), from the server, never from the loaded rows. */
function HistorySummary({ totals }: { totals: StudentHistoryPage["totals"] }) {
  return (
    <section aria-labelledby="historico-resumo">
      <h2 id="historico-resumo" className="sr-only">
        Resumo das suas entregas
      </h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
        {CARDS.map(({ key, icon: Icon, tone, captionTone }) => {
          const card = HISTORY_CARDS[key];
          return (
            <li key={key} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
              <span className="flex items-start justify-between gap-2">
                <span className="text-body-sm text-text-secondary">{card.title}</span>
                <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-md ${tone}`}>
                  <Icon className="size-5" />
                </span>
              </span>
              <span aria-hidden="true" className="text-display">
                {twoDigits(totals[key])}
              </span>
              <span className="sr-only">{card.spoken(totals[key])}</span>
              <span className={`text-caption ${captionTone}`}>{card.caption}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The date in two lines: "13 de novembro" and "Sexta-feira, 16:47" (with "com atraso" when late) — the delivery, or
 * when a missed activity stopped accepting one (028 HI11).
 */
function DeliveredAt({ item }: { item: StudentHistoryItem }) {
  const date = historyDate(item);
  return (
    <span className="flex flex-col">
      <time dateTime={date}>{formatDayMonth(date)}</time>
      <span className="text-caption text-text-secondary">
        {formatWeekdayTime(date)}
        {item.late && item.situation !== "MISSED" ? " (com atraso)" : ""}
      </span>
    </span>
  );
}

function ClassLines({ item }: { item: StudentHistoryItem }) {
  const { turma, subject } = historyClassLines(item);
  return (
    <span className="flex flex-col">
      <span>{turma}</span>
      {subject ? <span className="text-caption text-text-secondary">{subject}</span> : null}
    </span>
  );
}

/**
 * The "Nota" of a row: a released grade with its bar and "Com feedback"; "Aguardando correção" before it; an
 * exercise's points (013), never a grade or a bar. The grade shows only on a GRADED delivery (028/FR-018), the same
 * `situation` the pill reads, so the two never disagree.
 */
function HistoryScore({ item }: { item: StudentHistoryItem }) {
  // 028/FR-024: nothing was delivered, so there is nothing to grade or score.
  if (item.situation === "MISSED") return <span>—</span>;
  if (item.type === "EXERCISE") return <span>{item.points ? historyPoints(item.points) : "—"}</span>;
  if (item.situation !== "GRADED" || !item.result) return <span className="text-warning-text">{AWAITING_GRADE}</span>;
  const grade = formatGrade(item.result.grade);
  const total = formatGrade(item.totalGrade ?? "0.00");
  return (
    <span className="flex min-w-32 flex-col items-start gap-1">
      <span>
        <span className="text-h3">{grade}</span> <span className="text-body-sm text-text-secondary">de {total}</span>
      </span>
      <Progress value={historyGradePercent(item.result.grade, item.totalGrade)} aria-label={`Nota ${grade} de ${total}`} />
      {item.result.hasFeedback ? (
        <Badge variant="info">
          <MessageSquareText aria-hidden="true" />
          Com feedback
        </Badge>
      ) : null}
    </span>
  );
}

function HistoryStatus({ item }: { item: StudentHistoryItem }) {
  return <Status variant={historyStatusVariant(item)}>{historyStatusLabel(item)}</Status>;
}

/** Wide screens: the table of contracts/ui.md "List". */
function HistoryTable({ items }: { items: readonly StudentHistoryItem[] }) {
  return (
    <div className="hidden md:block">
      <Table>
        <TableCaption>{HISTORY_CAPTION}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Atividade</TableHead>
            <TableHead scope="col">Tipo</TableHead>
            <TableHead scope="col">Turma</TableHead>
            <TableHead scope="col">Entregue em</TableHead>
            <TableHead scope="col">Situação</TableHead>
            <TableHead scope="col">Nota</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Abrir</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Link href={activityHref(item.id)} className="flex flex-col text-primary">
                  <span>{item.title}</span>
                  <span aria-hidden="true" className="text-caption text-text-secondary">
                    {VIEW_ACTIVITY}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <Badge>{ACTIVITY_TYPE_LABELS[item.type]}</Badge>
              </TableCell>
              <TableCell>
                <ClassLines item={item} />
              </TableCell>
              <TableCell>
                <DeliveredAt item={item} />
              </TableCell>
              <TableCell>
                <HistoryStatus item={item} />
              </TableCell>
              <TableCell>
                <HistoryScore item={item} />
              </TableCell>
              <TableCell>
                <Link href={activityHref(item.id)} aria-label={`Abrir ${item.title}`} className="flex text-text-secondary">
                  <ChevronRight aria-hidden="true" className="size-5" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Phones: one card per delivery, the whole card one link. */
function HistoryCards({ items }: { items: readonly StudentHistoryItem[] }) {
  return (
    <ul aria-label={HISTORY_CAPTION} className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={activityHref(item.id)} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground">
            <span className="flex items-start justify-between gap-2">
              <span className="text-primary">{item.title}</span>
              <Badge>{ACTIVITY_TYPE_LABELS[item.type]}</Badge>
            </span>
            <span className="text-body-sm text-text-secondary">
              {item.subjectName ? `${item.class.name} · ${item.subjectName}` : item.class.name}
            </span>
            <DeliveredAt item={item} />
            <HistoryStatus item={item} />
            <HistoryScore item={item} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const SEARCH_ID = "historico-busca";
const SUBJECT_ID = "historico-materia";

/**
 * The search box (028/US3-1): its own text, applied (`onApply`) after `HISTORY_SEARCH_WAIT_MS` without typing or at
 * once on Enter, never one request per keystroke. A search changed from outside (the address, "Limpar busca e filtro")
 * replaces the text; the student's own applied text is kept as typed.
 */
function HistorySearch({ value, onApply }: { value: string; onApply: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (value !== seen) {
    setSeen(value);
    if (text.trim() !== value) setText(value);
  }
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <form
      role="search"
      className="relative w-full md:w-72"
      onSubmit={(event) => {
        event.preventDefault();
        stop();
        onApply(text);
      }}
    >
      <Label htmlFor={SEARCH_ID} className="sr-only">
        {HISTORY_SEARCH_LABEL}
      </Label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" />
      <Input
        id={SEARCH_ID}
        type="search"
        className="pl-10"
        maxLength={100}
        placeholder={HISTORY_SEARCH_PLACEHOLDER}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          stop();
          timer.current = setTimeout(() => {
            timer.current = null;
            onApply(next);
          }, HISTORY_SEARCH_WAIT_MS);
        }}
      />
    </form>
  );
}

/** The "Matéria" filter (028/US3-3): "Todas as matérias" first, then the student's subjects as the 026 card writes them. */
function SubjectFilter({ options, value, onChange }: { options: { id: string; label: string }[]; value: string | null; onChange: (classId: string | null) => void }) {
  return (
    <div className="flex w-full flex-col gap-1 md:w-64">
      <Label htmlFor={SUBJECT_ID}>{SUBJECT_LABEL}</Label>
      <NativeSelect id={SUBJECT_ID} className="w-full" value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">{ALL_SUBJECTS}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/**
 * The subject actually asked for (026 research D6, 028 HI8): the address's `materia` once "Minhas turmas" lists it;
 * one it doesn't list, or one the history answered `404` for (the enrollment ended while open: "Minhas turmas" is asked
 * again), falls back to every subject with the notice. Without "Minhas turmas" (a failure) the server decides. Only
 * the server decides what the student may read; this only chooses what to ask.
 */
function useHistorySubject(requested: string | null) {
  const queryClient = useQueryClient();
  const classes = useMyClasses();
  const items = mySubjectClasses(classes.data);
  const [missing, setMissing] = useState<readonly string[]>([]);
  useEffect(() => {
    if (missing.length > 0) void queryClient.invalidateQueries({ queryKey: myClassesKeys.list });
  }, [missing, queryClient]);
  const listed = requested === null || !classes.isSuccess || items.some((item) => item.id === requested);
  const unavailable = requested !== null && (missing.includes(requested) || !listed);
  return {
    options: subjectOptions(items),
    /** "Minhas turmas" still loading with a subject in the address: nothing is asked yet. */
    waiting: requested !== null && classes.isPending,
    classId: unavailable ? null : requested,
    unavailable,
    forget: (classId: string) => {
      if (!missing.includes(classId)) setMissing([...missing, classId]);
    },
  };
}

/**
 * "Histórico" (012 US6, redesigned in 028/US1): the three totals of every delivery, then the deliveries newest first
 * (`GET /me/history`) with the type, the class, the delivery date, the situation and the grade (or the points of an
 * exercise), the footer "Exibindo N de M atividades" with "Carregar mais", and the final note. Each row opens the
 * activity with the student's read-only answers. Since 028/US2 the tabs "Todas", "Aguardando" and "Corrigidas" (with
 * the server's counts) narrow the list on the server and live in the address (`?aba=`); since 028/US3 the search by
 * title (`?busca=`) and the "Matéria" filter (`?materia=`) too, combined with the tab.
 */
export function StudentHistory({ filters: address = ALL }: { filters?: StudentHistoryFilters }) {
  const router = useRouter();
  // The search and the subject applied while the address has not caught up yet (as the tab below): asked for at once.
  const addressKey = historyHref(address);
  const [applied, setApplied] = useState<{ from: string; q: string; classId: string | null } | null>(null);
  const filters: StudentHistoryFilters = applied?.from === addressKey ? { ...address, q: applied.q, classId: applied.classId } : address;
  const subject = useHistorySubject(filters.classId);
  const sent: StudentHistoryFilters = { ...filters, classId: subject.classId };
  const query = useStudentHistory(sent, { enabled: !subject.waiting });
  const missing = sent.classId !== null && query.error != null && toApiError(query.error).status === 404 ? sent.classId : null;
  if (missing !== null) subject.forget(missing);
  const current = historyTabOf(filters.tab);
  // The tab chosen while the address has not caught up yet (Radix asks on mousedown and again on focus): it is
  // selected at once and asked for once; a new address (`filters`) makes it stale.
  const [chosen, setChosen] = useState<{ from: string; to: string } | null>(null);
  const asked = useRef<{ from: string; to: string } | null>(null);
  const selected = chosen?.from === current.slug ? chosen.to : current.slug;
  const apply = (next: { q?: string; classId?: string | null }) => {
    // The tab on screen, not the address's: a search right after a tab click must not undo the click.
    const tab = (HISTORY_TABS.find((spec) => spec.slug === selected) ?? current).tab;
    const target = { ...sent, tab, q: (next.q ?? filters.q).trim(), classId: next.classId === undefined ? sent.classId : next.classId };
    if (target.q === filters.q.trim() && target.classId === filters.classId) return;
    setApplied({ from: addressKey, q: target.q, classId: target.classId });
    router.replace(historyHref(target));
  };
  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const first = pages[0];

  if (subject.waiting || query.isPending || missing !== null) return <Loading label={HISTORY_LOADING} />;
  if (!first) return <LoadFailed error={query.error} onRetry={() => void query.refetch()} />;
  const latest = pages[pages.length - 1]!;
  const filtered = historyFiltered(sent);

  return (
    <div className="flex flex-col gap-6">
      {subject.unavailable ? (
        <Alert variant="info">
          <AlertTitle>{SUBJECT_UNAVAILABLE}</AlertTitle>
        </Alert>
      ) : null}
      <HistorySummary totals={latest.totals} />
      {latest.totals.delivered === 0 && latest.totals.missed === 0 && sent.classId === null ? (
        <EmptyState icon={History} title={HISTORY_EMPTY} />
      ) : (
        <section aria-label="Suas entregas" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <Tabs
            value={selected}
            onValueChange={(slug) => {
              const next = HISTORY_TABS.find((spec) => spec.slug === slug);
              const last = asked.current?.from === current.slug ? asked.current.to : current.slug;
              if (!next || slug === last) return;
              asked.current = { from: current.slug, to: slug };
              setChosen(asked.current);
              router.replace(historyHref({ ...sent, tab: next.tab }));
            }}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <HistoryTabList counts={latest.tabCounts} />
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <HistorySearch value={filters.q} onApply={(q) => apply({ q })} />
                <SubjectFilter options={subject.options} value={sent.classId} onChange={(classId) => apply({ classId })} />
              </div>
            </div>
            <TabsContent value={selected} className="flex flex-col gap-4" aria-busy={query.isPlaceholderData || undefined}>
              {items.length === 0 && filtered ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <p className="m-0 text-text-secondary">{NO_MATCH}</p>
                  <Button type="button" variant="secondary" onClick={() => apply({ q: "", classId: null })}>
                    {CLEAR_FILTERS}
                  </Button>
                </div>
              ) : items.length === 0 ? (
                <p className="m-0 py-6 text-center text-text-secondary">{current.empty}</p>
              ) : (
                <>
                  <HistoryTable items={items} />
                  <HistoryCards items={items} />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm text-text-secondary">
                    <span>{historyFooter(items.length, latest.total)}</span>
                    <span>{HISTORY_ORDER}</span>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
          {query.isFetchNextPageError ? <LoadFailed error={query.error} onRetry={() => void query.fetchNextPage()} /> : null}
          {query.hasNextPage ? (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              aria-disabled={query.isFetchingNextPage || undefined}
              onClick={() => {
                if (!query.isFetchingNextPage) void query.fetchNextPage();
              }}
            >
              {query.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </Button>
          ) : null}
        </section>
      )}
      <p className="m-0 flex items-center gap-2 text-body-sm text-text-secondary">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        {HISTORY_FINAL_NOTE}
      </p>
    </div>
  );
}

/**
 * The screen exits of a delivered CONTROLLED work (015/US5-2, FR-027): "Saídas da tela registradas:
 * n" and the time of each exit, as the server recorded it (the browser's time only for an event
 * kept offline). The orientations of the AI stay under their questions. Facts, never a verdict.
 */
export function ScreenExitRecords({ activityId }: { activityId: string }) {
  const query = useOwnIntegrity(activityId, true);
  if (query.isPending) return <Loading label="Carregando os registros da entrega…" />;
  if (query.isError) return <LoadFailed error={query.error} onRetry={() => void query.refetch()} />;
  const exits = query.data.events.filter((event) => event.type === "SCREEN_LEFT");
  return (
    <section aria-labelledby="saidas-registradas" className="flex flex-col gap-2">
      <h2 id="saidas-registradas" className="m-0 text-h3">
        {screenExitsLabel(query.data.totals.screenExits)}
      </h2>
      <p className="m-0 text-body-sm text-text-secondary">{SCREEN_EXITS_NOTE}</p>
      {exits.length > 0 ? (
        <ul aria-label="Horários das saídas" className="m-0 flex flex-col gap-1 pl-5">
          {exits.map((event, index) => {
            const at = occurredAt(event);
            return (
              <li key={`${index}-${event.recordedAt}`}>
                <time dateTime={at}>{formatTime(at)}</time>
                {at !== event.recordedAt ? " (horário do navegador)" : ""}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** "Outro (texto)": the reason as the student chose it, with their own note. */
const ownReason = (pause: StudentPause) => (pause.note ? `${PAUSE_REASON_LABELS[pause.reason]} (${pause.note})` : PAUSE_REASON_LABELS[pause.reason]);

/**
 * The student's own room exits in a delivered work (016 US4-4, FR-021): the reason, the exit, the
 * return and the duration of each, from the server's times. Only their own; never the class's
 * attendance nor another student's situation.
 */
export function OwnRoomExits({ pauses }: { pauses: readonly StudentPause[] }) {
  if (pauses.length === 0) return null;
  return (
    <section aria-labelledby="saidas-sala" className="flex flex-col gap-2">
      <h2 id="saidas-sala" className="m-0 text-h3">
        {ROOM_EXITS_TITLE}
      </h2>
      <ul aria-label={ROOM_EXITS_TITLE} className="m-0 flex flex-col gap-1 pl-5">
        {pauses.map((pause) => (
          <li key={pause.id}>
            {ownReason(pause)}: saída às <time dateTime={pause.startedAt}>{formatTime(pause.startedAt)}</time>
            {pause.endedAt ? (
              <>
                , retorno às <time dateTime={pause.endedAt}>{formatTime(pause.endedAt)}</time> (
                {formatDuration(Math.floor((Date.parse(pause.endedAt) - Date.parse(pause.startedAt)) / 1000))})
              </>
            ) : (
              `, ${NO_RETURN}`
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 018/US8-4: the title of the student's own occurrences in a finished exam. */
export const OWN_OCCURRENCES_TITLE = "Ocorrências da prova";

/**
 * The student's own occurrences in a finished exam (018/US8-4, FR-031): the number, the kind and the
 * server's time of each, which the API sends only once the attempt ended. Only their own; facts, never
 * a verdict (FR-032).
 */
export function OwnExamOccurrences({ occurrences }: { occurrences: readonly ExamOccurrenceView[] }) {
  return (
    <section aria-labelledby="ocorrencias-prova" className="flex flex-col gap-2">
      <h2 id="ocorrencias-prova" className="m-0 text-h3">
        {OWN_OCCURRENCES_TITLE}
      </h2>
      {occurrences.length === 0 ? (
        <p className="m-0">{NO_EXAM_OCCURRENCES}</p>
      ) : (
        <ol aria-label={OWN_OCCURRENCES_TITLE} className="m-0 flex list-none flex-col gap-1 p-0">
          {occurrences.map((occurrence) => (
            <li key={occurrence.ordinal}>
              {occurrence.ordinal}. {OCCURRENCE_KIND_LABELS[occurrence.kind]} às{" "}
              <time dateTime={occurrence.recordedAt}>{formatTime(occurrence.recordedAt)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
