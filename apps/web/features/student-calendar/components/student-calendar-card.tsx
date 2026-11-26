"use client";

import type { StudentCalendar } from "@repo/contracts";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  isCalendarGone,
  useStudentCalendar,
} from "../hooks/use-student-calendar";
import {
  addDays,
  CARD_TITLE,
  canGoNext,
  canGoPrevious,
  CHOOSE_A_DAY,
  dayButtonName,
  dayDetail,
  dayNumber,
  DOT_CLASSES,
  initialSelection,
  LOAD_FAILED,
  LOADING,
  longDay,
  monthLabel,
  NEXT_WEEK,
  NOT_PUBLISHED,
  NOTHING_MARKED,
  type Period,
  periodOf,
  PREVIOUS_WEEK,
  RETRY,
  subjectLine,
  weekdayShort,
  weekDays,
  weekLabel,
} from "../schemas/week";

const TITLE_ID = "calendario-aluno-titulo";

/**
 * "Seu calendário de aulas" (031/US3, FR-014 – FR-019, contracts/ui.md "Student"): the matéria's week Monday–Sunday,
 * the arrows between the period's first and last week, a dot per marked day and, under the week, what the chosen day
 * holds — never a topic, a meeting number or the reason of an absence (the API never sends them). Mounted by the Painel
 * with the 026 matéria as `key`, so a new matéria opens again on today's week. A `404` renders nothing: the Painel's 026
 * fallback moves to another matéria.
 */
export function StudentCalendarCard({ classId }: { classId: string }) {
  const query = useStudentCalendar(classId);
  if (query.isError && isCalendarGone(query.error)) return null;

  return (
    <section aria-labelledby={TITLE_ID}>
      <Card className="gap-3 shadow-sm">
        {query.isPending ? (
          <>
            <Header />
            <CardContent aria-busy="true" className="flex flex-col gap-2">
              <span className="sr-only">{LOADING}</span>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </>
        ) : query.isError ? (
          <>
            <Header />
            <CardContent>
              <Alert variant="danger">
                <AlertTitle>{LOAD_FAILED}</AlertTitle>
                <AlertDescription>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void query.refetch()}
                  >
                    {RETRY}
                  </Button>
                </AlertDescription>
              </Alert>
            </CardContent>
          </>
        ) : (
          <CalendarBody calendar={query.data} />
        )}
      </Card>
    </section>
  );
}

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <CardHeader className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <CalendarDays
          aria-hidden="true"
          className="mt-1 size-5 shrink-0 text-primary"
        />
        <h2 id={TITLE_ID} className="m-0 text-h2">
          {CARD_TITLE}
        </h2>
      </div>
      {children}
    </CardHeader>
  );
}

function CalendarBody({ calendar }: { calendar: StudentCalendar }) {
  const period = periodOf(calendar);
  const start =
    period && calendar.days.length > 0
      ? initialSelection(calendar.today, period, calendar.days)
      : null;
  if (!period || !start) {
    return (
      <>
        <Header />
        <CardContent>
          <p className="m-0 text-body text-text-secondary">{NOT_PUBLISHED}</p>
        </CardContent>
      </>
    );
  }
  return <Week calendar={calendar} period={period} start={start} />;
}

function Week({
  calendar,
  period,
  start,
}: {
  calendar: StudentCalendar;
  period: Period;
  start: { week: string; selected: string | null };
}) {
  const [week, setWeek] = useState(start.week);
  const [selected, setSelected] = useState<string | null>(start.selected);
  const byDate = new Map(calendar.days.map((day) => [day.date, day]));
  const days = weekDays(week);

  // 031/US3-8: moving the week clears the chosen day until the student picks one.
  const move = (delta: number) => {
    setWeek(addDays(week, delta * 7));
    setSelected(null);
  };

  const detail = selected ? dayDetail(byDate.get(selected)) : null;
  return (
    <>
      <Header>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-label">{monthLabel(week)}</span>
            <span className="flex items-center gap-1 text-body-sm text-text-secondary">
              <span
                aria-hidden="true"
                className="inline-block size-2 rounded-full bg-primary"
              />
              {calendar.class.subjectName}
            </span>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={PREVIOUS_WEEK}
              disabled={!canGoPrevious(week, period)}
              onClick={() => move(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={NEXT_WEEK}
              disabled={!canGoNext(week, period)}
              onClick={() => move(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Header>
      <CardContent className="flex flex-col gap-4">
        <p className="m-0 text-body-sm text-text-secondary">
          {weekLabel(week)}
        </p>
        <ul
          aria-label={weekLabel(week)}
          className="m-0 grid list-none grid-cols-7 gap-1 p-0"
        >
          {days.map((date) => {
            const day = byDate.get(date);
            const isToday = date === calendar.today;
            return (
              <li key={date} className="min-w-0">
                <Button
                  type="button"
                  variant={selected === date ? "primary" : "ghost"}
                  aria-pressed={selected === date}
                  aria-label={dayButtonName(date, day, calendar.today)}
                  onClick={() => setSelected(date)}
                  className={cn(
                    "h-auto w-full min-w-0 flex-col gap-1 px-0 py-2",
                    isToday && selected !== date && "border border-primary",
                  )}
                >
                  <span className="text-caption">{weekdayShort(date)}</span>
                  <span className="text-body font-semibold">
                    {dayNumber(date)}
                  </span>
                  <span
                    aria-hidden="true"
                    data-kind={day?.kind}
                    className={cn(
                      "inline-block size-2 rounded-full",
                      day ? DOT_CLASSES[day.kind] : "bg-transparent",
                    )}
                  />
                </Button>
              </li>
            );
          })}
        </ul>
        <div
          aria-live="polite"
          className="flex flex-col gap-1 rounded-md border border-border p-3"
        >
          {selected === null ? (
            <p className="m-0 text-body-sm text-text-secondary">
              {CHOOSE_A_DAY}
            </p>
          ) : (
            <>
              <p className="m-0 text-label">{longDay(selected)}</p>
              {detail ? (
                <>
                  <p className="m-0 flex items-center gap-2 text-body font-semibold">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-block size-2 rounded-full",
                        DOT_CLASSES[byDate.get(selected)!.kind],
                      )}
                    />
                    {detail.label}
                  </p>
                  {detail.text ? (
                    <p className="m-0 text-body">{detail.text}</p>
                  ) : null}
                  <p className="m-0 text-body-sm text-text-secondary">
                    {subjectLine(calendar)}
                  </p>
                </>
              ) : (
                <p className="m-0 text-body-sm text-text-secondary">
                  {NOTHING_MARKED}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </>
  );
}
