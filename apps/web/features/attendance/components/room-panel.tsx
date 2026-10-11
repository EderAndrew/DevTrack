"use client";

import type { AttendanceBatch, Room, RoomStatus } from "@repo/contracts";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { messageForError } from "@/lib/messages/error-messages";
import { useApplyAttendance } from "../hooks/use-attendance";
import { MARK_PRESENT, ROOM_STATUS_LABELS, UNMARK } from "../schemas/attendance";

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
 * the catalog's message and reads the room again, which then offers the pause.
 */
export function RoomPanel({ classId, activityId, room }: RoomPanelProps) {
  const apply = useApplyAttendance(classId, activityId);
  const [error, setError] = useState<string | null>(null);

  const send = async (batch: AttendanceBatch) => {
    setError(null);
    try {
      await apply.mutateAsync(batch);
    } catch (caught) {
      setError(messageForError(caught));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="m-0 text-danger-text">
          {error}
        </p>
      ) : null}
      <ul aria-label="Alunos da turma" className="m-0 flex list-none flex-col gap-2 p-0">
        {room.students.map((row) => (
          <li key={row.studentUserId} className="flex flex-wrap items-center gap-2">
            <span>{row.name}</span>
            <Badge variant={STATUS_VARIANTS[row.roomStatus]} data-room-status={row.roomStatus}>
              {ROOM_STATUS_LABELS[row.roomStatus]}
            </Badge>
            {row.roomStatus === "NOT_MARKED" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={`${MARK_PRESENT} ${row.name}`}
                disabled={apply.isPending}
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
                disabled={apply.isPending}
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
