import { Check } from "lucide-react";
import {
  DAY_KIND_LABELS,
  type DayMark,
  NO_CLASS_DAYS_TITLE,
} from "../schemas/day-kinds";
import { formatIsoDate, meetingLabel } from "./calendar-dates";
import { DayKindDot } from "./day-kind-icon";

export type MarkedDay = DayMark & { date: string };

export interface MeetingListProps {
  /** The encontros ("YYYY-MM-DD" and kind), in date order. */
  meetings: readonly MarkedDay[];
  /** 031: the days without class (Feriado, Recesso, Evento especial, Falta do professor), in date order. */
  days?: readonly MarkedDay[];
  /** Dates whose class was concluded (004/US9): struck through, with a check and the word. */
  completed?: ReadonlySet<string>;
}

/** " · Prova: P1 — Herança": the kind and description of an encontro that is not a plain Aula. */
const kindSuffix = (day: MarkedDay) =>
  day.kind === "CLASS"
    ? ""
    : ` · ${DAY_KIND_LABELS[day.kind]}${day.description ? `: ${day.description}` : ""}`;

/**
 * The encontros numbered in date order, as they will be saved (FR-027), each with its kind and description (031); the
 * days without class apart, under "Dias sem aula", with the Falta's reason (only the teacher sees this list).
 */
export function MeetingList({
  meetings,
  days = [],
  completed = new Set(),
}: MeetingListProps) {
  return (
    <div className="flex flex-col gap-4">
      {meetings.length === 0 ? (
        <p className="m-0">Nenhuma aula marcada.</p>
      ) : (
        <ol
          aria-label="Aulas selecionadas"
          className="m-0 list-none gap-x-10 p-0 sm:columns-2"
        >
          {meetings.map((meeting, index) =>
            completed.has(meeting.date) ? (
              <li
                key={meeting.date}
                className="flex break-inside-avoid items-center gap-1 py-2"
              >
                <span className="line-through">
                  {meetingLabel(index + 1, meeting.date)}
                </span>
                <Check
                  aria-hidden="true"
                  className="size-4 shrink-0 text-success-text"
                />
                <span className="sr-only">(aula concluída)</span>
                {kindSuffix(meeting)}
              </li>
            ) : (
              <li key={meeting.date} className="break-inside-avoid py-2">
                {meetingLabel(index + 1, meeting.date)}
                {kindSuffix(meeting)}
              </li>
            ),
          )}
        </ol>
      )}
      {days.length > 0 ? (
        <section
          aria-labelledby="dias-sem-aula"
          className="flex flex-col gap-2"
        >
          <h3 id="dias-sem-aula" className="m-0 text-label">
            {NO_CLASS_DAYS_TITLE}
          </h3>
          <ul
            aria-labelledby="dias-sem-aula"
            className="m-0 flex list-none flex-col gap-2 p-0"
          >
            {days.map((day) => (
              <li key={day.date} className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <DayKindDot kind={day.kind} />
                  {`${formatIsoDate(day.date)} — ${DAY_KIND_LABELS[day.kind]}${day.description ? `: ${day.description}` : ""}`}
                </span>
                {day.kind === "TEACHER_ABSENCE" ? (
                  <span className="text-body-sm text-text-secondary">
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
