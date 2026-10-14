import type { IntegrityEventType } from "@repo/contracts";
import type { Tx } from "../../platform/database/transaction";
import type { AuditService } from "../audit/audit.service";

/** The attempt an event belongs to (composite FK of `attempt_integrity_events`). */
export interface IntegrityAttempt {
  id: string;
  activityId: string;
  studentUserId: string;
}

export interface NewIntegrityEvent {
  clientEventId: string;
  type: IntegrityEventType;
  questionId: string | null;
  /** Only for an event sent from the offline buffer (CHECK). */
  clientOccurredAt: Date | null;
  buffered: boolean;
  /** 018: `INACTIVITY` only, the browser's idle time (CHECK). */
  idleSeconds?: number | null;
}

/**
 * Writes the events with the server's time (015/FR-010, research F4): `ON CONFLICT DO NOTHING` on
 * `(attempt_id, client_event_id)`, so a resend is a no-op, and each event actually inserted is audited
 * as `attempt_integrity.recorded` in the same transaction — by the student (USER) or, for the
 * server's own typing refusal, by the SYSTEM. The events of one batch keep its order one microsecond
 * apart (below the millisecond the views show), so a return sent with its exit still pairs with it.
 * The database refuses an attempt that is not open or not of a CONTROLLED activity (trigger).
 * Returns the ids inserted now.
 */
export async function insertIntegrityEvents(
  tx: Tx,
  audit: AuditService,
  input: { attempt: IntegrityAttempt; events: readonly NewIntegrityEvent[]; now: Date; actor: "USER" | "SYSTEM"; requestId: string | null },
): Promise<Set<string>> {
  const { attempt, now } = input;
  const rows = JSON.stringify(
    input.events.map((event) => ({
      client_event_id: event.clientEventId,
      type: event.type,
      question_id: event.questionId,
      client_occurred_at: event.buffered ? event.clientOccurredAt?.toISOString() : null,
      buffered: event.buffered,
      idle_seconds: event.idleSeconds ?? null,
    })),
  );
  const inserted = await tx.$queryRaw<{ client_event_id: string; type: IntegrityEventType; buffered: boolean }[]>`
    INSERT INTO attempt_integrity_events
      (attempt_id, activity_id, student_user_id, client_event_id, type, question_id, recorded_at, client_occurred_at, buffered, idle_seconds)
    SELECT ${attempt.id}::uuid, ${attempt.activityId}::uuid, ${attempt.studentUserId}::uuid, e.client_event_id,
           e.type::attempt_integrity_event_type, e.question_id,
           ${now}::timestamptz + (e.position - 1) * interval '1 microsecond', e.client_occurred_at, e.buffered, e.idle_seconds
    FROM ROWS FROM (
      jsonb_to_recordset(${rows}::jsonb) AS (client_event_id uuid, type text, question_id uuid, client_occurred_at timestamptz, buffered boolean, idle_seconds smallint)
    ) WITH ORDINALITY AS e (client_event_id, type, question_id, client_occurred_at, buffered, idle_seconds, position)
    ORDER BY e.position
    ON CONFLICT (attempt_id, client_event_id) DO NOTHING
    RETURNING client_event_id, type::text AS type, buffered`;
  const byId = new Map(inserted.map((row) => [row.client_event_id, row]));
  const ordered = input.events.flatMap((event) => byId.get(event.clientEventId) ?? []);
  for (const row of ordered) {
    await audit.record(tx, {
      type: "attempt_integrity.recorded",
      actorType: input.actor,
      actorUserId: input.actor === "USER" ? attempt.studentUserId : null,
      targetType: "ACTIVITY_ATTEMPT",
      targetId: attempt.id,
      requestId: input.requestId,
      metadata: { eventType: row.type, buffered: row.buffered },
    });
  }
  return new Set(byId.keys());
}
