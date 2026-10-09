import type { AttemptStatus, PauseInitiator, PauseReason, RoomStudent, TeacherPause } from "@repo/contracts";
import { type PauseEndContext, pauseTime } from "../activities/status/pause-time";
import { deriveRoomStatus } from "./room-status";

/** One stored room exit (016 data-model.md `attempt_pauses`). */
export interface StoredPause {
  id: string;
  initiatedBy: PauseInitiator;
  reason: PauseReason;
  note: string | null;
  startedAt: Date;
  releasedAt: Date | null;
}

/** What the teacher sees of a pause: its end and duration derived with the server's `now` (research M7). */
export function toTeacherPause(pause: StoredPause, context: PauseEndContext, now: Date): TeacherPause {
  const time = pauseTime(pause, context, now);
  return {
    id: pause.id,
    initiatedBy: pause.initiatedBy,
    reason: pause.reason,
    note: pause.note,
    startedAt: pause.startedAt.toISOString(),
    endedAt: time.endedAt?.toISOString() ?? null,
    endedBy: time.endedBy,
    seconds: time.seconds,
  };
}

/** One ACTIVE student of the class as the room query reads them (research M8). */
export interface RoomRow {
  studentUserId: string;
  name: string;
  markedAt: Date | null;
  attempt: { id: string; status: AttemptStatus } | null;
  /** The attempt's pause with no release, if any; it may still have ended by derivation. */
  unreleasedPause: StoredPause | null;
  pauseEnd: PauseEndContext;
}

/** A row of the "Chamada" tab: the situation in the room and the pause only while it is open (FR-020). */
export function toRoomStudent(row: RoomRow, now: Date): RoomStudent {
  const pause = row.unreleasedPause && toTeacherPause(row.unreleasedPause, row.pauseEnd, now);
  const openPause = pause && pause.endedBy === null ? pause : null;
  return {
    studentUserId: row.studentUserId,
    name: row.name,
    markedAt: row.markedAt?.toISOString() ?? null,
    roomStatus: deriveRoomStatus({ marked: row.markedAt !== null, attemptStatus: row.attempt?.status ?? null, pauseOpen: openPause !== null }),
    attemptId: row.attempt?.id ?? null,
    openPause,
  };
}
