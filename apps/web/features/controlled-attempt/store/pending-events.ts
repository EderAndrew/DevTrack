import { type ClientIntegrityEventType, type IntegrityEventInput, IntegrityEventInputSchema } from "@repo/contracts";
import { z } from "zod";

// Integrity events the server has not confirmed yet (015/FR-010, research F4), kept in this
// browser so a dropped connection loses none: each is sent later `buffered`, with the browser's
// time. Every access is wrapped in try/catch: without storage they stay in memory only.

export const PENDING_EVENTS_PREFIX = "devtrack:eventos:";

const StoredSchema = z.array(IntegrityEventInputSchema);

const keyOf = (userId: string, activityId: string) => `${PENDING_EVENTS_PREFIX}${userId}:${activityId}`;

export function readPendingEvents(userId: string, activityId: string): IntegrityEventInput[] {
  try {
    const raw = window.localStorage.getItem(keyOf(userId, activityId));
    if (raw === null) return [];
    const parsed = StoredSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Replaces the unsent events; an empty list removes the key. */
export function writePendingEvents(userId: string, activityId: string, events: readonly IntegrityEventInput[]): void {
  try {
    if (events.length === 0) window.localStorage.removeItem(keyOf(userId, activityId));
    else window.localStorage.setItem(keyOf(userId, activityId), JSON.stringify(events));
  } catch {
    // No storage: the queue keeps them in memory.
  }
}

/** An event as kept for later: marked `buffered`, its browser time kept. */
export const asBuffered = (event: IntegrityEventInput): IntegrityEventInput => ({ ...event, buffered: true });

/** Events per request (`INTEGRITY_EVENTS_MAX` of the contract). */
const BATCH = 50;

export type SendEvents = (events: IntegrityEventInput[]) => Promise<{ recorded: { eventId: string; recordedAt: string }[] }>;

export interface EventQueueOptions {
  userId: string;
  activityId: string;
  send: SendEvents;
  /** Whether a failed send is worth repeating (no answer, 429, 5xx); a refusal drops the batch. */
  retryable: (error: unknown) => boolean;
  /** Whether the failure means no connection: it records a `CONNECTION_LOST`. */
  offline: (error: unknown) => boolean;
  newId?: () => string;
  now?: () => Date;
}

export interface EventQueue {
  /** Queues one event with the browser's time and sends what is queued; its id. */
  record: (type: ClientIntegrityEventType, questionId?: string) => string;
  /** Sends what is queued, in order, 50 at a time. */
  flush: () => Promise<void>;
  /** The connection dropped (the browser's `offline`, or a save that got no answer). */
  connectionLost: () => void;
  /** The server's time of an event, once it confirmed it. */
  recordedAt: (eventId: string) => string | null;
  pendingCount: () => number;
  subscribe: (listener: () => void) => () => void;
}

/**
 * The integrity events of one attempt on their way to the server (015/FR-010, research F4): every
 * event is queued in this browser first, then sent in order. A send that gets no answer marks the
 * queue `buffered` and adds `CONNECTION_LOST` with the browser's time; the first send that succeeds
 * after it carries `CONNECTION_RESTORED`, stamped by the server. A resend is harmless (the server
 * keeps one event per id). Nothing is read from the page here: the hooks tell it what happened.
 */
export function createEventQueue(options: EventQueueOptions): EventQueue {
  const { userId, activityId, send } = options;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());
  // Left from an earlier visit: they are late now, so sent as buffered.
  let queue: IntegrityEventInput[] = readPendingEvents(userId, activityId).map(asBuffered);
  const recorded = new Map<string, string>();
  const listeners = new Set<() => void>();
  let sending: Promise<void> | null = null;

  const changed = () => {
    writePendingEvents(userId, activityId, queue);
    for (const listener of listeners) listener();
  };
  const lost = () => queue.some((event) => event.type === "CONNECTION_LOST");
  const markLost = () => {
    queue = queue.map(asBuffered);
    if (!lost()) queue.push({ eventId: newId(), type: "CONNECTION_LOST", clientOccurredAt: now().toISOString(), buffered: true });
  };

  const drain = async () => {
    while (queue.length > 0) {
      const batch = queue.slice(0, BATCH);
      const last = batch.length === queue.length;
      // Back online: the first request that goes through says so, timed by the server.
      const restored: IntegrityEventInput | null =
        last && lost() && batch.length < BATCH
          ? { eventId: newId(), type: "CONNECTION_RESTORED", clientOccurredAt: now().toISOString(), buffered: false }
          : null;
      try {
        const result = await send(restored ? [...batch, restored] : batch);
        for (const item of result.recorded) recorded.set(item.eventId, item.recordedAt);
        const sent = new Set(batch.map((event) => event.eventId));
        queue = queue.filter((event) => !sent.has(event.eventId));
        changed();
      } catch (error) {
        if (options.offline(error)) markLost();
        else if (!options.retryable(error)) queue = queue.filter((event) => !batch.includes(event));
        else queue = queue.map(asBuffered);
        changed();
        if (options.retryable(error)) return;
      }
    }
  };

  const flush = (): Promise<void> => {
    // A send in flight may have finished its loop before this event was queued: go again after it.
    if (sending) return sending.then(() => (queue.length > 0 && !sending ? flush() : undefined));
    sending = drain().finally(() => {
      sending = null;
    });
    return sending;
  };

  return {
    record(type, questionId) {
      const eventId = newId();
      queue.push({ eventId, type, ...(questionId ? { questionId } : {}), clientOccurredAt: now().toISOString(), buffered: false });
      changed();
      void flush();
      return eventId;
    },
    flush,
    connectionLost() {
      markLost();
      changed();
    },
    recordedAt: (eventId) => recorded.get(eventId) ?? null,
    pendingCount: () => queue.length,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
