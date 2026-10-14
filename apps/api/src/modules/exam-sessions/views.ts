import type { ActivityStatus, ExamHoldResolution, PauseInitiator, PauseReason, TeacherExamHold, TeacherPause } from "@repo/contracts";
import { type PauseEndContext, pauseTime } from "../activities/status/pause-time";
import { canReturn } from "./exam-status";

/** One stored hold (018 data-model `exam_attempt_holds`). */
export interface StoredHold {
  id: string;
  attemptId: string;
  occurrenceOrdinal: number;
  openedAt: Date;
  resolution: ExamHoldResolution | null;
  resolvedAt: Date | null;
}

/** What the teacher sees of a hold (research T9): `canReturn` derived with the attempt's end and the server's `now`. */
export function toTeacherExamHold(hold: StoredHold, endsAt: Date, activityStatus: ActivityStatus, now: Date): TeacherExamHold {
  return {
    id: hold.id,
    attemptId: hold.attemptId,
    occurrenceOrdinal: hold.occurrenceOrdinal,
    openedAt: hold.openedAt.toISOString(),
    resolution: hold.resolution,
    resolvedAt: hold.resolvedAt?.toISOString() ?? null,
    canReturn: canReturn(hold, endsAt, activityStatus, now),
  };
}

/** A pause with no release, as the monitor reads it from `attempt_pauses` (research T12: its own query). */
export interface UnreleasedPause {
  id: string;
  initiatedBy: PauseInitiator;
  reason: PauseReason;
  note: string | null;
  startedAt: Date;
}

/** The pause while it is still open by derivation (016 research M7), as the teacher sees it; null once it ended. */
export function openPauseOf(pause: UnreleasedPause | null, context: PauseEndContext, now: Date): TeacherPause | null {
  if (!pause) return null;
  const time = pauseTime({ startedAt: pause.startedAt, releasedAt: null }, context, now);
  if (time.endedBy !== null) return null;
  return {
    id: pause.id,
    initiatedBy: pause.initiatedBy,
    reason: pause.reason,
    note: pause.note,
    startedAt: pause.startedAt.toISOString(),
    endedAt: null,
    endedBy: null,
    seconds: time.seconds,
  };
}
