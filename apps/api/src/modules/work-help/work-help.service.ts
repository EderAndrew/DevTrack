import { Inject, Injectable } from "@nestjs/common";
import { AI_HELP_ALLOWANCE, type RequestHelp, type StudentHelpItem, type StudentHelpState } from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { derivedUuid } from "../../platform/crypto/derived-uuid";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound, rateLimited } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { assignmentSchedule } from "../activities/status/facts";
import { decideOperation } from "../activities/status/operations";
import { AiExecutionsService } from "../ai/execution/ai-executions.service";
import { AuditService } from "../audit/audit.service";
import { AttemptPaused, type OwnAttemptContext, StudentActivityLoader } from "../student-activities/student-activity-loader";
import { WORK_HELPER_KEY } from "./definitions/work-helper";
import { reconcileHelpRequests } from "./help/reconcile";
import { WORK_HELP_REQUEST } from "./definitions/request-content";
import { HELP_REQUEST_SELECT, toStudentHelpItem } from "./help/views";

const HOUR_SEC = 3600;

/** The route pattern `student_access.denied` names (never the URL with its ids). */
const HELP_ROUTE = "/me/activities/:activityId/attempt/help";

/** The AI foundation's answers that mean "no help can be served now" (research F3). */
const UNAVAILABLE: ReadonlySet<string> = new Set(["AI_AGENT_NOT_FOUND", "AI_AGENT_DISABLED", "AI_MODEL_UNAVAILABLE"]);

/** Thrown inside the transaction when the activity is out of the student's context (→ 404 after the rollback). */
class OutOfContext extends Error {}

/** Thrown inside the transaction when the key was used before: answer that request. */
class SameKey extends Error {
  constructor(readonly requestId: string) {
    super("SAME_KEY");
  }
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * The student's AI help (015 US3, research F8–F11): a question about one question of their own open
 * attempt of a work with the help on, answered by the `work-helper` through the AI foundation. The
 * request and its execution are created in one transaction (`beforeCreate`) under the attempt's
 * `FOR UPDATE`, so at most one request is pending per attempt and never more than 3 are delivered;
 * the same idempotency key answers the same request. Every read and the next request reconcile a
 * pending request whose execution ended without completing to FAILED, which uses no help. Every
 * query starts from the session user's ACTIVE enrollment (`StudentActivityLoader`); out of context →
 * 404 and `student_access.denied`. Nothing here chooses a model or reads the answer key.
 */
@Injectable()
export class WorkHelpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly loader: StudentActivityLoader,
    private readonly executions: AiExecutionsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * In the order of contracts/http-api.md: the context (404), the same key (the same request, 200),
   * the rules (409, 422), the per-student hourly limit (429), then the foundation (503 when the help
   * can't be served). The rules run again under the locks in the creating transaction.
   * `created: false` → 200 with the existing request.
   */
  async request(auth: AuthContext, activityId: string, body: RequestHelp, requestId: string | null): Promise<{ item: StudentHelpItem; created: boolean }> {
    const studentUserId = auth.userId;
    const now = this.clock.now();
    try {
      await this.prisma.runInTransaction((tx) => this.admissible(tx, studentUserId, activityId, body, now));
    } catch (error) {
      if (error instanceof SameKey) return { item: await this.replay(error.requestId, body), created: false };
      if (error instanceof OutOfContext) return this.denied(studentUserId, activityId, now, requestId);
      if (error instanceof AttemptPaused) return this.pausedRefusal(studentUserId, activityId, error, requestId);
      throw error;
    }
    await this.assertRate(studentUserId, requestId);

    // Derived from the key, like the execution's: the help's id is the execution's resource, so
    // concurrent requests with the same key must hash alike to replay instead of 409 KEY_REUSED.
    const helpId = derivedUuid(`work-help-request:${studentUserId}:${activityId}:${body.idempotencyKey}`);
    try {
      const { created } = await this.executions.request(
        auth,
        {
          agentKey: WORK_HELPER_KEY,
          resource: { type: WORK_HELP_REQUEST, id: helpId },
          input: {},
          idempotencyKey: derivedUuid(`work-help:${activityId}:${body.idempotencyKey}`),
        },
        requestId,
        {
          beforeCreate: async (tx) => {
            const { attemptId } = await this.admissible(tx, studentUserId, activityId, body, now);
            await tx.workHelpRequest.create({
              data: {
                id: helpId,
                attemptId,
                activityId,
                studentUserId,
                questionId: body.questionId,
                idempotencyKey: body.idempotencyKey,
                question: body.question,
                requestedAt: now,
              },
            });
          },
          onCreated: async (tx, executionId) => {
            const row = await tx.workHelpRequest.update({
              where: { id: helpId },
              data: { aiExecutionId: executionId },
              select: { attemptId: true, questionRef: { select: { position: true } } },
            });
            await this.audit.record(tx, {
              type: "work_help.requested",
              actorType: "USER",
              actorUserId: studentUserId,
              targetType: "WORK_HELP_REQUEST",
              targetId: helpId,
              requestId,
              metadata: { attemptId: row.attemptId, executionId, questionPosition: row.questionRef.position },
            });
          },
        },
      );
      if (!created) return { item: await this.replayByKey(studentUserId, activityId, body), created: false };
    } catch (error) {
      if (error instanceof AppException && UNAVAILABLE.has(error.code)) throw new AppException("AI_HELP_UNAVAILABLE");
      if (error instanceof SameKey) return { item: await this.replay(error.requestId, body), created: false };
      if (error instanceof OutOfContext) return this.denied(studentUserId, activityId, now, requestId);
      if (error instanceof AttemptPaused) return this.pausedRefusal(studentUserId, activityId, error, requestId);
      // A concurrent request of the same attempt won the one pending slot, or the same key won.
      if (isUniqueViolation(error)) {
        const winner = await this.findByKey(studentUserId, activityId, body.idempotencyKey);
        if (winner) return { item: await this.replay(winner.id, body), created: false };
        throw new AppException("HELP_PENDING");
      }
      throw error;
    }
    const row = await this.prisma.workHelpRequest.findUniqueOrThrow({ where: { id: helpId }, select: HELP_REQUEST_SELECT });
    return { item: toStudentHelpItem(row), created: true };
  }

  /**
   * The student's helps in their latest attempt (FR-019, FR-020): `used` counts DELIVERED only. No
   * attempt yet → nothing used, nothing pending.
   */
  async state(studentUserId: string, activityId: string, requestId: string | null): Promise<StudentHelpState> {
    const now = this.clock.now();
    const context = await this.loader.ownAttempt(studentUserId, activityId, now);
    if (!context) return this.denied(studentUserId, activityId, now, requestId);
    const attempt = context.attempt;
    if (!attempt) return { allowance: context.aiHelpAllowance, used: 0, pending: false, items: [] };
    const rows = await this.prisma.runInTransaction(async (tx) => {
      await reconcileHelpRequests(tx, this.audit, attempt.id, now);
      return tx.workHelpRequest.findMany({ where: { attemptId: attempt.id }, orderBy: [{ requestedAt: "asc" }, { id: "asc" }], select: HELP_REQUEST_SELECT });
    });
    return {
      allowance: context.aiHelpAllowance,
      used: rows.filter((row) => row.status === "DELIVERED").length,
      pending: rows.some((row) => row.status === "REQUESTED"),
      items: rows.map(toStudentHelpItem),
    };
  }

  /**
   * The rules of a new request (research F11), under the activity's `FOR SHARE` and the attempt's
   * `FOR UPDATE`: a work with the help on; a started, not submitted attempt the 012 rule still lets
   * the student answer (deadline, closed activity, inactive class); a question of the activity; no
   * pending request (after reconciling the failed ones) and fewer than 3 delivered.
   */
  private async admissible(tx: Tx, studentUserId: string, activityId: string, body: RequestHelp, now: Date): Promise<{ attemptId: string }> {
    const context = await this.loader.ownAttempt(studentUserId, activityId, now, tx, "UPDATE");
    if (!context) throw new OutOfContext();
    const existing = await this.findByKey(studentUserId, activityId, body.idempotencyKey, tx);
    if (existing) throw new SameKey(existing.id);
    if (context.type !== "ASSIGNMENT" || context.aiHelpAllowance !== AI_HELP_ALLOWANCE) throw new AppException("HELP_NOT_ENABLED");
    const attempt = context.attempt;
    if (!attempt) throw new AppException("NOT_STARTED");
    if (attempt.status === "SUBMITTED") throw new AppException("ATTEMPT_ALREADY_SUBMITTED");
    // 016/FR-013: no new request while the student is out of the room; one pending from before still resolves.
    if (context.paused) throw new AttemptPaused(attempt.id, context.paused.pauseId);
    const outcome = decideOperation("SAVE", factsOf(context, now));
    if (outcome.kind === "REFUSED") throw new AppException(outcome.code);
    const question = await tx.classActivityQuestion.count({ where: { id: body.questionId, activityId } });
    if (question === 0) throw new AppException("UNKNOWN_QUESTION");
    await reconcileHelpRequests(tx, this.audit, attempt.id, now);
    const requests = await tx.workHelpRequest.groupBy({ by: ["status"], where: { attemptId: attempt.id, status: { in: ["REQUESTED", "DELIVERED"] } }, _count: true });
    const count = (status: string) => requests.find((row) => row.status === status)?._count ?? 0;
    if (count("REQUESTED") > 0) throw new AppException("HELP_PENDING");
    if (count("DELIVERED") >= AI_HELP_ALLOWANCE) throw new AppException("HELP_EXHAUSTED");
    return { attemptId: attempt.id };
  }

  private findByKey(studentUserId: string, activityId: string, idempotencyKey: string, db: Pick<Tx, "workHelpRequest"> = this.prisma) {
    return db.workHelpRequest.findFirst({ where: { studentUserId, activityId, idempotencyKey }, select: { id: true } });
  }

  private async replayByKey(studentUserId: string, activityId: string, body: RequestHelp): Promise<StudentHelpItem> {
    const winner = await this.findByKey(studentUserId, activityId, body.idempotencyKey);
    if (!winner) throw new AppException("AI_IDEMPOTENCY_KEY_REUSED");
    return this.replay(winner.id, body);
  }

  /** The same key answers the same request only for the same question and text (006 semantics). */
  private async replay(helpId: string, body: RequestHelp): Promise<StudentHelpItem> {
    const row = await this.prisma.workHelpRequest.findUniqueOrThrow({ where: { id: helpId }, select: HELP_REQUEST_SELECT });
    if (row.questionId !== body.questionId || row.question !== body.question) throw new AppException("AI_IDEMPOTENCY_KEY_REUSED");
    return toStudentHelpItem(row);
  }

  /** Requests per student per hour, whatever their outcome (research F12). */
  private async assertRate(studentUserId: string, requestId: string | null): Promise<void> {
    const state = await this.rateLimit.hit("work-help", studentUserId, { limit: this.config.rateLimit.workHelpPerHour, windowSec: HOUR_SEC });
    if (!state.blocked) return;
    await this.audit.record(this.prisma, {
      type: "ai_execution.rate_limited",
      actorType: "USER",
      actorUserId: studentUserId,
      requestId,
      metadata: { scope: "work-help" },
    });
    throw rateLimited(state.retryAfterSec);
  }

  /** 409 ATTEMPT_PAUSED, recorded on its own after the rollback (016 contracts/audit-events.md). */
  private async pausedRefusal(studentUserId: string, activityId: string, error: AttemptPaused, requestId: string | null): Promise<never> {
    await this.audit.record(this.prisma, {
      type: "attempt_pause.write_refused",
      actorType: "USER",
      actorUserId: studentUserId,
      targetType: "ACTIVITY_ATTEMPT",
      targetId: error.attemptId,
      requestId,
      metadata: { activityId, pauseId: error.pauseId, operation: "HELP" },
    });
    throw new AppException("ATTEMPT_PAUSED");
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
        metadata: { route: HELP_ROUTE, reason },
      });
    }
    throw notFound();
  }
}

/** The 012 facts of the student's open attempt of a work, for the deadline rule of a save. */
function factsOf(context: OwnAttemptContext, now: Date) {
  return {
    type: "ASSIGNMENT" as const,
    activityStatus: context.activityStatus,
    ...assignmentSchedule(context),
    classActive: context.classActive,
    attempt: context.attempt && { status: context.attempt.status },
    submission: null,
    released: false,
    now,
  };
}
