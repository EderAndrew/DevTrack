import { CalendarDays } from "lucide-react";

/** The "Ano letivo" card of the 030 "Minhas turmas" header (contracts/ui.md): the chosen year. */
export function AcademicYearCard({ year }: { year: number }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-5 py-3">
      <CalendarDays aria-hidden="true" className="size-5 text-primary" />
      <p className="m-0 flex flex-col">
        <span className="text-caption uppercase text-text-secondary">Ano letivo</span>
        <span className="text-h2">{year}</span>
      </p>
    </div>
  );
}
