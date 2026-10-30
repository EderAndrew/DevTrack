import { Inject, Injectable } from "@nestjs/common";
import type { DeclareExit, MyPause, StudentPause } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound, rateLimited } from "../../platform/http/errors";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";
import { type OwnAttemptContext, StudentActivityLoader } from "../student-activities/student-activity-loader";
import { type StoredPause, toStudentPause } from "./views";

const HOUR_SEC = 3600;

/** The route pattern `student_access.denied` names (never the URL with its ids). */
const PAUSE_ROUTE = "/me/activities/:activityId/attempt/pause";

const PAUSE_SELECT = { id: true, studentUserId: true, initiatedBy: true, reason: true, note: true, startedAt: true, releasedAt: true } as const;

/** Thrown inside the transaction when the activity is out of the student's context (→ 404 after the rollback). */
class OutOfContext extends Error {}

/** Thrown inside the transaction for an exam: only the teacher pauses it (018/FR-026, research T11). */
class ExitNotAllowed extends Error {}

/**
 * "Sair da sala" (016 US3, FR-011–FR-013, research M6, M8): the student's declared exit pauses their
 * own open attempt of a `PRESENT_ONLY` work, and the answering page polls for the open pause. The
 * declaration runs in the transaction shape of save and submit — the activity in the student's context
 * `FOR SHARE` (a close waits) and the attempt `FOR UPDATE`, so it is ordered with every write of the
 * attempt (US3-9) — and returns the pause already open (200) on a double click or a second tab. Times
 * come from the server clock; a pause is a fact for the teacher, never a grade or a block of the
 * deadline (FR-018). Out of context → 404 and `student_access.denied`. An exam has no declared exit
 * (018/FR-026): `409 EXIT_NOT_ALLOWED`, audited as `activity_submission.rejected`, nothing written.
 */
@Injectable()
export class MyPauseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly loader: StudentActivityLoader,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `created: false` → 200 with the pause that was already open. */
  async declare(studentUserId: string, activityId: string, body: DeclareExit, requestId: string | null): Promise<{ pause: StudentPause; created: boolean }> {
    const now = this.clock.now();
    try {
      return await this.prisma.runInTransaction(async (tx) => {
        const context = await this.loader.ownAttempt(studentUserId, activityId, now, tx, "UPDATE");
        if (!context) throw new OutOfContext();
        if (context.type === "EXAM") throw new ExitNotAllowed();
        const attempt = pausableAttempt(context);
        await this.assertRate(tx, studentUserId);
        if (context.paused) {
          const open = await tx.attemptPause.findUniqueOrThrow({ where: { id: context.paused.pauseId }, select: PAUSE_SELECT });
          return { pause: toStudentPause(open), created: false };
        }
        const pause: StoredPause = await tx.attemptPause.create({
          data: {
            attemptId: attempt.id,
            activityId,
            studentUserId,
            initiatedBy: "STUDENT",
            reason: body.reason,
            note: body.note ?? null,
            startedAt: now,
            startedById: studentUserId,
          },
          select: PAUSE_SELECT,
        });
        await this.audit.record(tx, {
          type: "attempt_pause.started",
          actorType: "USER",
          actorUserId: studentUserId,
          targetType: "ACTIVITY_ATTEMPT",
          targetId: attempt.id,
          requestId,
          metadata: { activityId, pauseId: pause.id, initiatedBy: "STUDENT", reason: body.reason },
        });
        return { pause: toStudentPause(pause), created: true };
      });
    } catch (error) {
      if (error instanceof OutOfContext) return this.denied(studentUserId, activityId, now, requestId);
      if (error instanceof ExitNotAllowed) {
        await this.audit.record(this.prisma, {
          type: "activity_submission.rejected",
          actorType: "USER",
          actorUserId: studentUserId,
          targetType: "CLASS_ACTIVITY",
          targetId: activityId,
          requestId,
          metadata: { operation: "EXIT", code: "EXIT_NOT_ALLOWED" },
        });
        throw new AppException("EXIT_NOT_ALLOWED");
      }
      throw error;
    }
  }

  /** The open pause of the own latest attempt, or null (research M8); out of context → 404. */
  async get(studentUserId: string, activityId: string, requestId: string | null): Promise<MyPause> {
    const now = this.clock.now();
    const context = await this.loader.ownAttempt(studentUserId, activityId, now);
    if (!context) return this.denied(studentUserId, activityId, now, requestId);
    if (!context.paused) return { pause: null };
    const open = await this.prisma.attemptPause.findUniqueOrThrow({ where: { id: context.paused.pauseId }, select: PAUSE_SELECT });
    return { pause: toStudentPause(open) };
  }

  /**
   * Declared exits per student and hour (research M11), on the pause's `tx`, which holds the
   * attempt's lock: a refused declaration rolls the counter back with it.
   */
  private async assertRate(tx: Tx, studentUserId: string): Promise<void> {
    const state = await this.rateLimit.hit("attempt-pauses", studentUserId, { limit: this.config.rateLimit.attemptPausesPerHour, windowSec: HOUR_SEC }, tx);
    if (state.blocked) throw rateLimited(state.retryAfterSec);
  }

  /** 404, auditing `student_access.denied` when the activity exists (012 research P18). */
  private async denied(userId: string, activityId: string, now: Date, requestId: string | null): Promise<never> {
    const reason = await this.loader.deniedReason(userId, activityId, now);
    if (reason) {
      await this.audit.record(this.prisma, {
        type: "student_access.denied",
        actorType: "USER",
        actorUserId: userId,
        targetType: "CLASS_ACTIVITY",
        targetId: activityId,
        requestId,
        metadata: { route: PAUSE_ROUTE, reason },
      });
    }
    throw notFound();
  }
}

/**
 * The attempt a student may pause (contracts/http-api.md): a work that takes attendance, started, not
 * submitted, of an ACTIVE activity and class. The deadline doesn't matter: it keeps running (FR-015).
 */
function pausableAttempt(context: OwnAttemptContext): NonNullable<OwnAttemptContext["attempt"]> {
  if (context.releaseMode !== "PRESENT_ONLY") throw new AppException("ATTENDANCE_NOT_REQUIRED");
  if (!context.attempt) throw new AppException("NOT_STARTED");
  if (context.attempt.status === "SUBMITTED") throw new AppException("ATTEMPT_ALREADY_SUBMITTED");
  if (context.activityStatus !== "ACTIVE" || !context.classActive) throw new AppException("ACTIVITY_CLOSED");
  return context.attempt;
}
