"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useOccurrences } from "../hooks/use-exam-session";
import { NO_OCCURRENCES, occurrenceLabel } from "../schemas/exam-session";

export interface OccurrenceListProps {
  classId: string;
  activityId: string;
  attemptId: string;
  /** The student's name, for the list's accessible name. */
  name: string;
}

/**
 * "Ver ocorrências" (018/FR-025, FR-031): each counted occurrence with its number, its kind in words
 * and the server's time. Facts only: no label, no grade.
 */
export function OccurrenceList({ classId, activityId, attemptId, name }: OccurrenceListProps) {
  const query = useOccurrences(classId, activityId, attemptId);
  if (query.isPending) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando as ocorrências…</span>
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (query.isError) return <p role="alert" className="m-0 text-danger-text">{messageForError(query.error)}</p>;
  const counted = query.data.events.filter((event) => event.occurrenceOrdinal !== null);
  if (counted.length === 0) return <p className="m-0">{NO_OCCURRENCES}</p>;
  return (
    <ol aria-label={`Ocorrências de ${name}`} className="m-0 flex list-none flex-col gap-1 p-0">
      {counted.map((event) => (
        <li key={event.occurrenceOrdinal} className="text-body-sm">
          {event.occurrenceOrdinal}. {occurrenceLabel(event)} — {formatTime(event.recordedAt)}
        </li>
      ))}
    </ol>
  );
}
