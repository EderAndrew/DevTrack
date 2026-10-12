import { EXAM_WARNINGS, type IntegrityEventType } from "@repo/contracts";
import type { ExamHoldResolution, ExamOccurrenceKind } from "../../generated/prisma/client";

/**
 * The occurrence count of an exam attempt (018 research T6, T8): which integrity events open a new
 * occurrence, and which occurrence opens the hold. Pure; the service runs it in the event insert's
 * transaction under the attempt's `FOR UPDATE`, so the ordinals are gap-free. The count is the
 * server's: the browser only reports facts.
 */

/** One alt+tab fires both a focus and a fullscreen event: within this window they count once. */
export const OCCURRENCE_GROUP_WINDOW_MS = 2000;

/** The countable types and their occurrence kind; returns, connection events and notices never count. */
const KIND_OF: Partial<Record<IntegrityEventType, ExamOccurrenceKind>> = {
  SCREEN_LEFT: "SCREEN_LEFT",
  FULLSCREEN_EXITED: "FULLSCREEN_EXITED",
  PASTE_BLOCKED: "CLIPBOARD",
  COPY_BLOCKED: "CLIPBOARD",
  CUT_BLOCKED: "CLIPBOARD",
  DROP_BLOCKED: "CLIPBOARD",
  INACTIVITY: "INACTIVITY",
};

/** The occurrence kind of a countable event type, or null. */
export const occurrenceKindOf = (type: IntegrityEventType): ExamOccurrenceKind | null => KIND_OF[type] ?? null;

/** An event of the batch as stored: the server's `recordedAt`, and the browser's time only when buffered. */
export interface StoredExamEvent {
  id: string;
  type: IntegrityEventType;
  recordedAt: Date;
  clientOccurredAt: Date | null;
  buffered: boolean;
}

/** The attempt's latest hold, if any. */
export interface LastHold {
  occurrenceOrdinal: number;
  resolution: ExamHoldResolution | null;
}

/** The attempt as the batch finds it. */
export interface CountState {
  /** `max(ordinal)`, 0 when none. */
  lastOrdinal: number;
  /** The server time of the latest occurrence, null when none. */
  lastOccurrenceAt: Date | null;
  lastHold: LastHold | null;
  /** Paused, on hold or submitted: events are facts only, nothing counts (FR-020). */
  counting: boolean;
  endsAt: Date;
}

export interface NewOccurrence {
  ordinal: number;
  kind: ExamOccurrenceKind;
  firstEventId: string;
  recordedAt: Date;
}

export interface CountResult {
  occurrences: NewOccurrence[];
  /** The ordinal of the occurrence that opens a hold, if one does. */
  holdAt: number | null;
}

/**
 * Whether occurrence `ordinal` opens a hold: the 4th (`EXAM_WARNINGS + 1`), or the first one after
 * the teacher returned the exam. Never while a hold is open or after a decision that ended the exam.
 */
export function opensHold(ordinal: number, lastHold: LastHold | null): boolean {
  if (lastHold === null) return ordinal > EXAM_WARNINGS;
  return lastHold.resolution === "RETURNED" && ordinal > lastHold.occurrenceOrdinal;
}

interface Anchor {
  recordedAt: Date;
  /** Set when the occurrence was opened by a buffered event of this batch. */
  bufferedAt: Date | null;
}

/**
 * Within the window of the latest occurrence: by the browser's times when both are buffered events of
 * this batch (they share one `recordedAt`), otherwise by the server's.
 */
function grouped(anchor: Anchor, event: StoredExamEvent): boolean {
  if (anchor.bufferedAt && event.buffered && event.clientOccurredAt) {
    return Math.abs(event.clientOccurredAt.getTime() - anchor.bufferedAt.getTime()) < OCCURRENCE_GROUP_WINDOW_MS;
  }
  return event.recordedAt.getTime() - anchor.recordedAt.getTime() < OCCURRENCE_GROUP_WINDOW_MS;
}

/**
 * The occurrences a batch opens, in the batch's order. A countable event opens one unless it falls
 * within the window of the latest occurrence; nothing counts while the attempt doesn't count, at or
 * after `endsAt`, or once an occurrence of this batch opened a hold.
 */
export function countBatch(events: readonly StoredExamEvent[], state: CountState): CountResult {
  const occurrences: NewOccurrence[] = [];
  if (!state.counting) return { occurrences, holdAt: null };
  let anchor: Anchor | null = state.lastOccurrenceAt ? { recordedAt: state.lastOccurrenceAt, bufferedAt: null } : null;
  let ordinal = state.lastOrdinal;
  for (const event of events) {
    const kind = occurrenceKindOf(event.type);
    if (kind === null || event.recordedAt >= state.endsAt) continue;
    if (anchor && grouped(anchor, event)) continue;
    ordinal += 1;
    occurrences.push({ ordinal, kind, firstEventId: event.id, recordedAt: event.recordedAt });
    if (opensHold(ordinal, state.lastHold)) return { occurrences, holdAt: ordinal };
    anchor = { recordedAt: event.recordedAt, bufferedAt: event.buffered ? event.clientOccurredAt : null };
  }
  return { occurrences, holdAt: null };
}
