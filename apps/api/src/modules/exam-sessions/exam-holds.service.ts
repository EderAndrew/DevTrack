import { Inject, Injectable } from "@nestjs/common";
import type { ExamHoldResolution, TeacherExamHold } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, invalidStateTransition, notFound, rateLimited } from "../../platform/http/errors";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { endsAt } from "../activities/status/exam-time";
import { registerSubmission } from "../activities/submission/register-submission";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { findExamActivity, timingOf } from "./exam-monitor.service";
import { type StoredHold, toTeacherExamHold } from "./views";

const MINUTE_SEC = 60;

/** The teacher's three decisions on a hold (contracts/http-api.md). */
export type HoldDecision = "cancel" | "return" | "keep";

interface HoldRow {
  id: string;
  attempt_id: string;
  student_user_id: string;
  occurrence_ordinal: number;
  opened_at: Date;
  resolution: ExamHoldResolution | null;
  resolved_at: Date | null;
}

/**
 * The teacher's decision on an exam attempt ended by warnings (018/FR-021–FR-023, research T9, T19),
 * keyed by the hold: under the activity `FOR SHARE` (a close, a cancellation or a release waits), the
 * attempt `FOR UPDATE` (ordered with every write of the student) and the hold `FOR UPDATE`, so a hold
 * gets exactly one resolution; any later decision → `409 INVALID_STATE_TRANSITION`, no event (US5-7).
 *
 * - "Confirmar cancelamento", any time the hold is open: the submission `CANCELLED`, dated at the hold,
 *   with every question the teacher's 0 (`HUMAN_DECISION`); the only zero an exam gets (FR-030).
 * - "Devolver prova", only while the attempt has time and the activity is ACTIVE: the attempt goes on
 *   with its saved answers and its end unchanged; the next counted occurrence opens a new hold.
 * - "Não cancelar", only once the end has come: the submission `ENDED_BY_WARNINGS`, dated at the hold,
 *   graded as 012 on the answers saved before it.
 *
 * Writes grades only through `activities/submission` (`exams-boundary.spec.ts`).
 */
@Injectable()
export class ExamHoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly classes: ClassContextPolicy,
    private readonly rateLimit: RateLimitService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async decide(
    teacherId: string,
    classId: string,
    activityId: string,
    holdId: string,
    decision: HoldDecision,
    requestId: string | null,
  ): Promise<TeacherExamHold> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    const limit = await this.rateLimit.hit("exam-decisions", teacherId, { limit: this.config.rateLimit.examDecisionsPerMinute, windowSec: MINUTE_SEC });
    if (limit.blocked) throw rateLimited(limit.retryAfterSec);
    return this.prisma.runInTransaction(async (tx) => {
      const activity = await findExamActivity(tx, classId, activityId, true);
      const located = await tx.$queryRaw<{ attempt_id: string }[]>`
        SELECT attempt_id FROM exam_attempt_holds WHERE id = ${holdId}::uuid AND activity_id = ${activityId}::uuid`;
      if (!located[0]) throw notFound();
      const attempts = await tx.$queryRaw<{ started_at: Date }[]>`
        SELECT started_at FROM activity_attempts WHERE id = ${located[0].attempt_id}::uuid FOR UPDATE`;
      const hold = await lockHold(tx, holdId);
      if (hold.resolution !== null) throw invalidStateTransition();

      const now = this.clock.now();
      const end = endsAt(timingOf(activity), attempts[0]!.started_at);
      const resolution = await this.apply(tx, decision, { teacherId, activityId, hold, end, now, activityActive: activity.status === "ACTIVE", requestId });
      await tx.examAttemptHold.update({ where: { id: holdId }, data: { resolution, resolvedAt: now, resolvedById: teacherId } });
      return toTeacherExamHold(storedHold({ ...hold, resolution, resolved_at: now }), end, activity.status, now);
    });
  }

  /** Checks the decision's own rule, writes what it implies and its audit event; returns the resolution. */
  private async apply(
    tx: Tx,
    decision: HoldDecision,
    input: { teacherId: string; activityId: string; hold: HoldRow; end: Date; now: Date; activityActive: boolean; requestId: string | null },
  ): Promise<ExamHoldResolution> {
    const { teacherId, activityId, hold, end, now } = input;
    const event = { actorType: "USER" as const, actorUserId: teacherId, targetType: "ACTIVITY_ATTEMPT" as const, targetId: hold.attempt_id, requestId: input.requestId };
    const settle = (endReason: "CANCELLED" | "ENDED_BY_WARNINGS") =>
      registerSubmission(tx, {
        attemptId: hold.attempt_id,
        activityId,
        studentUserId: hold.student_user_id,
        // Dated at the hold: the attempt ended there, whenever the teacher decides (research T9).
        now: hold.opened_at,
        late: false,
        endReason,
        ...(endReason === "CANCELLED" ? { cancellation: { teacherId, decidedAt: now } } : {}),
      });

    if (decision === "cancel") {
      const submission = await settle("CANCELLED");
      await this.audit.record(tx, { ...event, type: "exam_attempt.cancel_confirmed", metadata: { activityId, holdId: hold.id, submissionId: submission.submissionId } });
      return "CANCEL_CONFIRMED";
    }
    const timeOver = now >= end;
    if (decision === "return") {
      if (!input.activityActive) throw new AppException("ACTIVITY_CLOSED");
      if (timeOver) throw new AppException("EXAM_TIME_OVER");
      const secondsLeft = Math.floor((end.getTime() - now.getTime()) / 1000);
      await this.audit.record(tx, { ...event, type: "exam_attempt.returned", metadata: { activityId, holdId: hold.id, secondsLeft } });
      return "RETURNED";
    }
    // Before the end, not cancelling is returning (research T9).
    if (!timeOver) throw new AppException("EXAM_TIME_NOT_OVER");
    const submission = await settle("ENDED_BY_WARNINGS");
    await this.audit.record(tx, { ...event, type: "exam_attempt.not_cancelled", metadata: { activityId, holdId: hold.id, submissionId: submission.submissionId } });
    return "NOT_CANCELLED";
  }
}

async function lockHold(tx: Tx, holdId: string): Promise<HoldRow> {
  const rows = await tx.$queryRaw<HoldRow[]>`
    SELECT id, attempt_id, student_user_id, occurrence_ordinal, opened_at, resolution::text AS resolution, resolved_at
    FROM exam_attempt_holds WHERE id = ${holdId}::uuid
    FOR UPDATE`;
  return rows[0]!;
}

const storedHold = (row: HoldRow): StoredHold => ({
  id: row.id,
  attemptId: row.attempt_id,
  occurrenceOrdinal: row.occurrence_ordinal,
  openedAt: row.opened_at,
  resolution: row.resolution,
  resolvedAt: row.resolved_at,
});
