import { Inject, Injectable } from "@nestjs/common";
import type { RecordIntegrityEventsRequest, RecordIntegrityEventsResult, StudentIntegrity } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound, rateLimited } from "../../platform/http/errors";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";
import { type OwnAttemptContext, StudentActivityLoader } from "../student-activities/student-activity-loader";
import { insertIntegrityEvents } from "./integrity-events";
import { buildTimeline } from "./timeline";
import { type StoredIntegrityEvent, toEventView } from "./views";

const MINUTE_SEC = 60;

/** The route patterns `student_access.denied` names (never the URL with its ids). */
const EVENTS_ROUTE = "/me/activities/:activityId/attempt/events";
const INTEGRITY_ROUTE = "/me/activities/:activityId/attempt/integrity";

/** Thrown inside the transaction when the activity is out of the student's context (→ 404 after the rollback). */
class OutOfContext extends Error {}

/**
 * The student's side of the controlled mode (015/FR-009–FR-013c, research F4): the browser's events
 * of the student's own open attempt of a CONTROLLED work, stamped with the server clock and recorded
 * once per event id, and the student's own events afterwards. Every query starts from the session
 * user's ACTIVE enrollment (`StudentActivityLoader`); out of context → 404 and `student_access.denied`.
 * Nothing here blocks, submits or grades the attempt (FR-013).
 */
@Injectable()
export class FocusEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly loader: StudentActivityLoader,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Records a batch (1–50) under the activity's and the attempt's `FOR SHARE` (a close or the submit
   * waits), `ON CONFLICT DO NOTHING`: a resend returns the time stored the first time.
   */
  async record(studentUserId: string, activityId: string, body: RecordIntegrityEventsRequest, requestId: string | null): Promise<RecordIntegrityEventsResult> {
    const now = this.clock.now();
    try {
      return await this.prisma.runInTransaction(async (tx) => {
        const context = await this.loader.ownAttempt(studentUserId, activityId, now, tx);
        if (!context) throw new OutOfContext();
        await this.assertRate(studentUserId, body.events.length);
        const attempt = openAttempt(context);
        await assertQuestions(tx, activityId, body.events);
        const own = { id: attempt.id, activityId, studentUserId };
        await insertIntegrityEvents(tx, this.audit, {
          attempt: own,
          events: body.events.map((event) => ({
            clientEventId: event.eventId,
            type: event.type,
            questionId: event.questionId ?? null,
            clientOccurredAt: new Date(event.clientOccurredAt),
            buffered: event.buffered,
          })),
          now,
          actor: "USER",
          requestId,
        });
        const stored = new Map(
          (
            await tx.attemptIntegrityEvent.findMany({
              where: { attemptId: attempt.id, clientEventId: { in: body.events.map((event) => event.eventId) } },
              select: { clientEventId: true, recordedAt: true },
            })
          ).map((row) => [row.clientEventId, row.recordedAt]),
        );
        return { recorded: body.events.map((event) => ({ eventId: event.eventId, recordedAt: stored.get(event.eventId)!.toISOString() })) };
      });
    } catch (error) {
      if (error instanceof OutOfContext) return this.denied(studentUserId, activityId, now, EVENTS_ROUTE, requestId);
      throw error;
    }
  }

  /** The student's own events of their latest attempt, with the totals (015/FR-027); no attempt → 404. */
  async own(studentUserId: string, activityId: string, requestId: string | null): Promise<StudentIntegrity> {
    const now = this.clock.now();
    const context = await this.loader.ownAttempt(studentUserId, activityId, now);
    if (!context) return this.denied(studentUserId, activityId, now, INTEGRITY_ROUTE, requestId);
    if (!context.attempt) throw notFound();
    const timeline = buildTimeline(await storedEvents(this.prisma, context.attempt.id), context.attempt.submittedAt ?? now);
    return { events: timeline.events.map(toEventView), totals: timeline.totals };
  }

  /** Events per student and minute, each event of the batch counted (contracts/configuration.md). */
  private async assertRate(studentUserId: string, events: number): Promise<void> {
    const state = await this.rateLimit.hit("attempt-events", studentUserId, {
      limit: this.config.rateLimit.attemptEventsPerMinute,
      windowSec: MINUTE_SEC,
      weight: events,
    });
    if (state.blocked) throw rateLimited(state.retryAfterSec);
  }

  /** 404, auditing `student_access.denied` when the activity exists (012 research P18). */
  private async denied(userId: string, activityId: string, now: Date, route: string, requestId: string | null): Promise<never> {
    const reason = await this.loader.deniedReason(userId, activityId, now);
    if (reason) {
      await this.audit.record(this.prisma, {
        type: "student_access.denied",
        actorType: "USER",
        actorUserId: userId,
        targetType: "CLASS_ACTIVITY",
        targetId: activityId,
        requestId,
        metadata: { route, reason },
      });
    }
    throw notFound();
  }
}

/**
 * The attempt events may be recorded for (015/FR-010): a CONTROLLED work, started, not submitted,
 * neither closed by the teacher nor of an inactive class. The deadline doesn't matter: events are facts.
 */
function openAttempt(context: OwnAttemptContext): NonNullable<OwnAttemptContext["attempt"]> {
  if (context.executionMode !== "CONTROLLED") throw new AppException("NOT_CONTROLLED");
  if (!context.attempt) throw new AppException("NOT_STARTED");
  if (context.attempt.status === "SUBMITTED") throw new AppException("ATTEMPT_ALREADY_SUBMITTED");
  if (context.activityStatus !== "ACTIVE" || !context.classActive) throw new AppException("ACTIVITY_CLOSED");
  return context.attempt;
}

/** A question named by an event must be one of the activity's snapshot questions (→ 422). */
async function assertQuestions(tx: Tx, activityId: string, events: RecordIntegrityEventsRequest["events"]): Promise<void> {
  const ids = [...new Set(events.flatMap((event) => (event.questionId ? [event.questionId] : [])))];
  if (ids.length === 0) return;
  const found = await tx.classActivityQuestion.count({ where: { activityId, id: { in: ids } } });
  if (found !== ids.length) throw new AppException("UNKNOWN_QUESTION");
}

/** An attempt's events with their question's position (the teacher's timeline reads the same, US4). */
export async function storedEvents(db: Pick<Tx, "attemptIntegrityEvent">, attemptId: string): Promise<StoredIntegrityEvent[]> {
  const rows = await db.attemptIntegrityEvent.findMany({
    where: { attemptId },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    select: { type: true, questionId: true, recordedAt: true, clientOccurredAt: true, buffered: true, question: { select: { position: true } } },
  });
  return rows.map(({ question, ...row }) => ({ ...row, questionPosition: question?.position ?? null }));
}
