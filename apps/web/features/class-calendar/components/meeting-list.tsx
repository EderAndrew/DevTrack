import { Check } from "lucide-react";
import { meetingLabel } from "./calendar-dates";

export interface MeetingListProps {
  /** Selected dates ("YYYY-MM-DD"), in order. */
  dates: readonly string[];
  /** Dates whose class was concluded (004/US9): struck through, with a check and the word. */
  completed?: ReadonlySet<string>;
}

/** The selected class days numbered in date order, as they will be saved (FR-027). */
export function MeetingList({ dates, completed = new Set() }: MeetingListProps) {
  if (dates.length === 0) return <p>Nenhuma aula marcada.</p>;
  return (
    <ol aria-label="Aulas selecionadas" className="m-0 list-none gap-x-10 p-0 sm:columns-2">
      {dates.map((date, index) =>
        completed.has(date) ? (
          <li key={date} className="flex break-inside-avoid items-center gap-1 py-2">
            <span className="line-through">{meetingLabel(index + 1, date)}</span>
            <Check aria-hidden="true" className="size-4 shrink-0 text-success-text" />
            <span className="sr-only">(aula concluída)</span>
          </li>
        ) : (
          <li key={date} className="break-inside-avoid py-2">
            {meetingLabel(index + 1, date)}
          </li>
        ),
      )}
    </ol>
  );
}
