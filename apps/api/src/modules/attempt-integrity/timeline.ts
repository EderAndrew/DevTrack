import type { IntegrityEventType, IntegrityIntervalKind, IntegrityTotals } from "@repo/contracts";

/** One stored event of an attempt (015 data-model.md). */
export interface TimelineEvent {
  type: IntegrityEventType;
  questionId: string | null;
  recordedAt: Date;
  clientOccurredAt: Date | null;
  buffered: boolean;
}

/** An exit and its end, derived on every read and never stored (015 research F4). */
export interface TimelineInterval {
  kind: IntegrityIntervalKind;
  from: Date;
  to: Date;
  seconds: number;
  /** No return was recorded: it ends at the next event of the attempt or at `until`. */
  open: boolean;
}

export interface Timeline<E extends TimelineEvent = TimelineEvent> {
  /** In the order they happened (`occurredAt`). */
  events: E[];
  intervals: TimelineInterval[];
  totals: IntegrityTotals;
}

const EXITS: Partial<Record<IntegrityEventType, IntegrityIntervalKind>> = {
  SCREEN_LEFT: "SCREEN",
  FULLSCREEN_EXITED: "FULLSCREEN",
  CONNECTION_LOST: "CONNECTION",
};
const RETURNS: Partial<Record<IntegrityEventType, IntegrityIntervalKind>> = {
  SCREEN_RETURNED: "SCREEN",
  FULLSCREEN_ENTERED: "FULLSCREEN",
  CONNECTION_RESTORED: "CONNECTION",
};
const CLIPBOARD: ReadonlySet<IntegrityEventType> = new Set(["PASTE_BLOCKED", "COPY_BLOCKED", "CUT_BLOCKED", "DROP_BLOCKED"]);

/**
 * When an event happened: the server's time, or the browser's for one sent from the offline buffer
 * (FR-010) — never later than the server received it, so a browser clock ahead can't push it forward.
 */
export function occurredAt(event: TimelineEvent): Date {
  if (!event.buffered || event.clientOccurredAt === null) return event.recordedAt;
  return event.clientOccurredAt.getTime() < event.recordedAt.getTime() ? event.clientOccurredAt : event.recordedAt;
}

/**
 * The attempt's timeline (015/FR-024, research F4): events in the order they happened; each exit
 * (screen, fullscreen, connection) paired with the next return of its kind; an exit followed by
 * another of its kind ends there, open; an exit never returned ends at the next event of the
 * attempt, or at `until` (the submission, or now while it is open). Durations in whole seconds.
 */
export function buildTimeline<E extends TimelineEvent>(events: readonly E[], until: Date): Timeline<E> {
  const sorted = events
    .map((event, index) => ({ event, index, at: occurredAt(event).getTime() }))
    .sort((a, b) => a.at - b.at || a.event.recordedAt.getTime() - b.event.recordedAt.getTime() || a.index - b.index);
  const intervals: TimelineInterval[] = [];
  const open = new Map<IntegrityIntervalKind, { from: number; position: number }>();
  const close = (kind: IntegrityIntervalKind, to: number, isOpen: boolean) => {
    const start = open.get(kind)!;
    open.delete(kind);
    const end = Math.max(to, start.from);
    intervals.push({ kind, from: new Date(start.from), to: new Date(end), seconds: Math.floor((end - start.from) / 1_000), open: isOpen });
  };

  sorted.forEach(({ event, at }, position) => {
    const returned = RETURNS[event.type];
    if (returned && open.has(returned)) close(returned, at, false);
    const exited = EXITS[event.type];
    if (exited) {
      if (open.has(exited)) close(exited, at, true);
      open.set(exited, { from: at, position });
    }
  });
  for (const [kind, { position }] of [...open.entries()]) close(kind, sorted[position + 1]?.at ?? until.getTime(), true);
  intervals.sort((a, b) => a.from.getTime() - b.from.getTime());

  const of = (kind: IntegrityIntervalKind) => intervals.filter((interval) => interval.kind === kind);
  const seconds = (list: TimelineInterval[]) => list.reduce((sum, interval) => sum + interval.seconds, 0);
  return {
    events: sorted.map(({ event }) => event),
    intervals,
    totals: {
      screenExits: of("SCREEN").length,
      timeAwaySeconds: seconds(of("SCREEN")),
      fullscreenExits: of("FULLSCREEN").length,
      disconnections: of("CONNECTION").length,
      offlineSeconds: seconds(of("CONNECTION")),
      clipboardBlocks: events.filter((event) => CLIPBOARD.has(event.type)).length,
      typingLimitRejections: events.filter((event) => event.type === "TYPING_LIMIT_EXCEEDED").length,
      fullscreenUnavailable: events.some((event) => event.type === "FULLSCREEN_UNAVAILABLE"),
      detectionUnavailable: events.some((event) => event.type === "DETECTION_UNAVAILABLE"),
    },
  };
}
