import type { IntegrityEventView, IntegrityInterval } from "@repo/contracts";
import type { TimelineEvent, TimelineInterval } from "./timeline";

/** A stored event with its question's position (clipboard and typing events only). */
export interface StoredIntegrityEvent extends TimelineEvent {
  questionPosition: number | null;
  /** 018: `INACTIVITY` only. */
  idleSeconds?: number | null;
  /** 018: the exam occurrence this event opened, if any (research T6). */
  occurrenceOrdinal?: number | null;
}

/** What the student and the teacher see of one event (015 research F13): facts, no label. */
export const toEventView = (event: StoredIntegrityEvent): IntegrityEventView => ({
  type: event.type,
  questionPosition: event.questionPosition,
  recordedAt: event.recordedAt.toISOString(),
  clientOccurredAt: event.clientOccurredAt?.toISOString() ?? null,
  buffered: event.buffered,
  // EXAM only (018 research T6, T7).
  occurrenceOrdinal: event.occurrenceOrdinal ?? null,
  idleSeconds: event.idleSeconds ?? null,
});

export const toIntervalView = (interval: TimelineInterval): IntegrityInterval => ({
  kind: interval.kind,
  from: interval.from.toISOString(),
  to: interval.to.toISOString(),
  seconds: interval.seconds,
  open: interval.open,
});
