import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAY_KIND_LABELS,
  type DayMark,
  MEETING_DONE,
  MEETING_SCHEDULED,
  NO_CLASS_DAYS_TITLE,
} from "../schemas/day-kinds";
import { formatIsoDate } from "./calendar-dates";
import { DayKindDot } from "./day-kind-icon";

export type MarkedDay = DayMark & { date: string };

export interface MeetingListProps {
  /** The encontros ("YYYY-MM-DD" and kind), in date order. */
  meetings: readonly MarkedDay[];
  /** 031: the days without class (Feriado, Recesso, Evento especial, Falta do professor), in date order. */
  days?: readonly MarkedDay[];
  /** Dates whose class was concluded (004/US9): a check and "Concluída", the others "Programada". */
  completed?: ReadonlySet<string>;
  /** The day last chosen in the calendar, highlighted in the list. */
  current?: string | null;
}

/** "Prova: P1 — Herança": the kind and description of an encontro that is not a plain Aula. */
const kindText = (day: MarkedDay) =>
  day.kind === "CLASS" ? "" : `${DAY_KIND_LABELS[day.kind]}${day.description ? `: ${day.description}` : ""}`;

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The encontros numbered in date order, as they will be saved (FR-027), each with its date, kind and description (031)
 * and whether the class was concluded (004/US9); the days without class apart, under "Dias sem aula", with the Falta's
 * reason (only the teacher sees this list).
 */
export function MeetingList({ meetings, days = [], completed = new Set(), current = null }: MeetingListProps) {
  return (
    <div className="flex flex-col gap-4">
      {meetings.length === 0 ? (
        <p className="m-0 text-body-sm text-text-secondary">Nenhuma aula marcada.</p>
      ) : (
        <ol aria-label="Aulas selecionadas" className="m-0 flex list-none flex-col p-0">
          {meetings.map((meeting, index) => {
            const done = completed.has(meeting.date);
            const kind = kindText(meeting);
            return (
              <li
                key={meeting.date}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-sm px-3 py-2 text-body-sm",
                  meeting.date === current && "bg-primary-subtle",
                )}
              >
                <span className="font-medium">{`Aula ${pad(index + 1)}`}</span>
                <span className="text-text-secondary">
                  <span className="sr-only"> — </span>
                  {formatIsoDate(meeting.date)}
                </span>
                {done ? (
                  <span className="flex items-center gap-1 text-success-text">
                    <Check aria-hidden="true" className="size-4 shrink-0" />
                    <span className="sr-only"> · </span>
                    {MEETING_DONE}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span aria-hidden="true" className="inline-block size-1 shrink-0 rounded-full bg-current" />
                    <span className="sr-only"> · </span>
                    {MEETING_SCHEDULED}
                  </span>
                )}
                {kind ? (
                  <span className="col-span-3 flex items-center gap-2 text-caption text-text-secondary">
                    <DayKindDot kind={meeting.kind} />
                    <span className="sr-only"> · </span>
                    {kind}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {days.length > 0 ? (
        <section aria-labelledby="dias-sem-aula" className="flex flex-col gap-2">
          <h3 id="dias-sem-aula" className="m-0 text-label">
            {NO_CLASS_DAYS_TITLE}
          </h3>
          <ul aria-labelledby="dias-sem-aula" className="m-0 flex list-none flex-col gap-2 p-0 text-body-sm">
            {days.map((day) => (
              <li
                key={day.date}
                className={cn("flex flex-col gap-1 rounded-sm px-3 py-2", day.date === current && "bg-primary-subtle")}
              >
                <span className="flex items-center gap-2">
                  <DayKindDot kind={day.kind} />
                  {`${formatIsoDate(day.date)} — ${DAY_KIND_LABELS[day.kind]}${day.description ? `: ${day.description}` : ""}`}
                </span>
                {day.kind === "TEACHER_ABSENCE" ? (
                  <span className="text-caption text-text-secondary">
                    {`Motivo: ${day.absenceReason ?? ""}`}
                    {day.absenceNotice ? ` · Aviso: ${day.absenceNotice}` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
