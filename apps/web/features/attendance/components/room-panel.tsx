"use client";

import type { AttendanceBatch, Room, RoomStatus, RoomStudent } from "@repo/contracts";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { messageForError } from "@/lib/messages/error-messages";
import { useApplyAttendance, useReleasePause } from "../hooks/use-attendance";
import { awayForLabel, MARK_PRESENT, outOfRoomLabel, PAUSE_REASON_LABELS, RELEASE_RETURN, ROOM_STATUS_LABELS, UNMARK } from "../schemas/attendance";

const STATUS_VARIANTS: Record<RoomStatus, "neutral" | "info" | "success" | "warning"> = {
  NOT_MARKED: "neutral",
  PRESENT: "info",
  ANSWERING: "info",
  OUT_OF_ROOM: "warning",
  SUBMITTED: "success",
};

export interface RoomPanelProps {
  classId: string;
  activityId: string;
  room: Room;
}

/**
 * The room after the first release (016 contracts/web-ui.md, "Chamada"): each ACTIVE student by name
 * with their situation in words (FR-020) and the action it allows. "Marcar presente" releases the
 * work to a late student at once, a batch of 1 with no dialog (US2, FR-004); "Desmarcar" exists only
 * while the student is "Presente" (FR-005). A refused unmark — the student started meanwhile — shows
 * the catalog's message and reads the room again, which then offers the pause. Students out of the
 * room come first, as "Fora da sala — <motivo>, desde HH:MM" with the time away, and "Liberar
 * retorno" ends that pause (US3-4, US3-5, FR-014).
 */
export function RoomPanel({ classId, activityId, room }: RoomPanelProps) {
  const apply = useApplyAttendance(classId, activityId);
  const release = useReleasePause(classId, activityId);
  const [error, setError] = useState<string | null>(null);
  const busy = apply.isPending || release.isPending;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(messageForError(caught));
    }
  };
  const send = (batch: AttendanceBatch) => run(() => apply.mutateAsync(batch));

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="m-0 text-danger-text">
          {error}
        </p>
      ) : null}
      <ul aria-label="Alunos da turma" className="m-0 flex list-none flex-col gap-2 p-0">
        {outOfRoomFirst(room.students).map((row) => (
          <li key={row.studentUserId} className="flex flex-wrap items-center gap-2">
            <span data-student-name>{row.name}</span>
            <Badge variant={STATUS_VARIANTS[row.roomStatus]} data-room-status={row.roomStatus}>
              {row.openPause ? outOfRoomLabel(row.openPause.reason, row.openPause.startedAt) : ROOM_STATUS_LABELS[row.roomStatus]}
            </Badge>
            {row.openPause ? (
              <span className="text-body-sm text-text-secondary">
                {awayForLabel(row.openPause.seconds)}
                {row.openPause.reason === "OTHER" && row.openPause.note ? (
                  <span className="whitespace-pre-wrap">
                    {" "}
                    · {PAUSE_REASON_LABELS.OTHER}: {row.openPause.note}
                  </span>
                ) : null}
              </span>
            ) : null}
            {row.openPause ? (
              <Button
                type="button"
                size="sm"
                aria-label={`${RELEASE_RETURN} ${row.name}`}
                disabled={busy}
                onClick={() => void run(() => release.mutateAsync(row.openPause!.id))}
              >
                {RELEASE_RETURN}
              </Button>
            ) : null}
            {row.roomStatus === "NOT_MARKED" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={`${MARK_PRESENT} ${row.name}`}
                disabled={busy}
                onClick={() => void send({ mark: [row.studentUserId], unmark: [] })}
              >
                {MARK_PRESENT}
              </Button>
            ) : null}
            {row.roomStatus === "PRESENT" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={`${UNMARK} ${row.name}`}
                disabled={busy}
                onClick={() => void send({ mark: [], unmark: [row.studentUserId] })}
              >
                {UNMARK}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Students out of the room first, then the rest in the server's order (by name). */
const outOfRoomFirst = (students: readonly RoomStudent[]) => [
  ...students.filter((row) => row.openPause !== null),
  ...students.filter((row) => row.openPause === null),
];
