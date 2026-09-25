import { meetingLabel } from "./calendar-dates";

export interface MeetingListProps {
  /** Selected dates ("YYYY-MM-DD"), in order. */
  dates: readonly string[];
}

/** The selected class days numbered in date order, as they will be saved (FR-027). */
export function MeetingList({ dates }: MeetingListProps) {
  if (dates.length === 0) return <p>Nenhuma aula marcada.</p>;
  return (
    <ol aria-label="Aulas selecionadas" className="m-0 list-none gap-x-10 p-0 sm:columns-2">
      {dates.map((date, index) => (
        <li key={date} className="break-inside-avoid py-2">
          {meetingLabel(index + 1, date)}
        </li>
      ))}
    </ol>
  );
}
