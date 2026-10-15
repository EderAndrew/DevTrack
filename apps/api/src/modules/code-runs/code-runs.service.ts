import { Inject, Injectable } from "@nestjs/common";
import { type CodeRun, type CreateCodeRunRequest, type ExecutionKey, type LatestCodeRun, utf8ByteLength } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { type OwnAttemptContext, StudentActivityLoader } from "../student-activities/student-activity-loader";
import { RunnerAvailability, questionExecution } from "./availability";
import { settleStaleRuns } from "./settle-stale";
import { CODE_RUN_SELECT, toStudentRun } from "./views/student-run-view";

/** The route patterns `student_access.denied` names (never the URL with its ids). */
const RUNS_ROUTE = "/me/activities/:activityId/questions/:questionId/code-runs";
const LATEST_ROUTE = `${RUNS_ROUTE}/latest`;

/** Thrown inside the transaction when the question is outside the student's context (→ 404 after the rollback). */
class OutOfContext extends Error {}

/** The CODE question of an EXERCISE the student may run: its profile key and its PUBLIC case count. */
interface RunnableQuestion {
  execution: ExecutionKey | null;
  publicCaseCount: number;
}

/**
 * The student's code runs (019 US1, research B8, B9, B13). Every route starts from the session user's
 * ACTIVE enrollment (`StudentActivityLoader`): an EXERCISE of their class, published, not cancelled
 * nor closed, and a CODE question of it; anything else is the same 404 (`student_access.denied` when
 * the activity exists outside the context). Creating needs the student's own attempt in progress
 * (`409 ATTEMPT_NOT_IN_PROGRESS`), a language with execution and a PUBLIC case (`409
 * CODE_RUN_NOT_AVAILABLE`) and a live worker (`409 CODE_RUNNER_UNAVAILABLE`). One pending run per
 * student (partial UNIQUE, `INSERT … ON CONFLICT DO NOTHING`): a new request while one is pending
 * returns it (200). Reading or creating settles the student's stale runs first. Nothing here
 * touches the answer, the attempt, the conclusion, the points or the ranking (FR-008).
 */
@Injectable()
export class CodeRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly loader: StudentActivityLoader,
    private readonly availability: RunnerAvailability,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `created: false` → 200 with the student's pending run (of any question). */
  async create(auth: AuthContext, activityId: string, questionId: string, body: CreateCodeRunRequest, requestId: string | null): Promise<{ run: CodeRun; created: boolean }> {
    const studentUserId = auth.userId;
    const now = this.clock.now();
    let runId: string;
    let created: boolean;
    try {
      ({ runId, created } = await this.prisma.runInTransaction(async (tx) => {
        const { attempt, question } = await this.runnableQuestion(tx, studentUserId, activityId, questionId, now);
        if (!attempt || attempt.status !== "IN_PROGRESS") throw new AppException("ATTEMPT_NOT_IN_PROGRESS");
        if (question.execution === null) throw new AppException("CODE_RUN_NOT_AVAILABLE", undefined, {}, { reason: "NOT_SUPPORTED" });
        if (question.publicCaseCount === 0) throw new AppException("CODE_RUN_NOT_AVAILABLE", undefined, {}, { reason: "NO_PUBLIC_CASES" });

        await settleStaleRuns(tx, this.audit, { now, scope: { studentUserId }, disabled: !this.config.codeRunner.enabled });
        const execution = questionExecution(question, await this.availability.state(now));
        if (execution.status !== "AVAILABLE") throw new AppException("CODE_RUNNER_UNAVAILABLE");

        // A conflict waits for the other transaction and returns its pending run; if that run became
        // final in between (its worker finished), the slot is free again: one more insert.
        let id: string | undefined;
        for (let tries = 0; tries < 2 && !id; tries += 1) {
          const inserted = await tx.$queryRaw<{ id: string }[]>`
            INSERT INTO code_runs (activity_id, question_id, attempt_id, student_user_id, execution, source_code, public_case_count, created_at, deadline_at)
            VALUES (${activityId}::uuid, ${questionId}::uuid, ${attempt.id}::uuid, ${studentUserId}::uuid, ${question.execution},
                    ${body.sourceCode}, ${question.publicCaseCount}, ${now},
                    ${new Date(now.getTime() + this.config.codeRunner.queueDeadlineSeconds * 1000)})
            ON CONFLICT (student_user_id) WHERE status IN ('QUEUED', 'RUNNING') DO NOTHING
            RETURNING id`;
          id = inserted[0]?.id;
          if (id) break;
          const pending = await tx.codeRun.findFirst({ where: { studentUserId, status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
          if (pending) return { runId: pending.id, created: false };
        }
        if (!id) throw new AppException("CODE_RUNNER_UNAVAILABLE");
        const sourceBytes = utf8ByteLength(body.sourceCode);
        await this.audit.record(tx, {
          type: "code_run.requested",
          actorType: "USER",
          actorUserId: studentUserId,
          targetType: "CODE_RUN",
          targetId: id,
          requestId,
          metadata: {
            activityId,
            questionId,
            execution: question.execution,
            publicCaseCount: question.publicCaseCount,
            sourceBytes,
          },
        });
        return { runId: id, created: true };
      }));
    } catch (error) {
      if (error instanceof OutOfContext) return this.denied(studentUserId, activityId, now, RUNS_ROUTE, requestId);
      throw error;
    }
    return { run: await this.read(runId), created };
  }

  /** The last run of the question in the student's attempt in progress; none without one. */
  async latest(studentUserId: string, activityId: string, questionId: string, requestId: string | null): Promise<LatestCodeRun> {
    const now = this.clock.now();
    try {
      const runId = await this.prisma.runInTransaction(async (tx) => {
        const { attempt } = await this.runnableQuestion(tx, studentUserId, activityId, questionId, now);
        if (!attempt || attempt.status !== "IN_PROGRESS") return null;
        await settleStaleRuns(tx, this.audit, { now, scope: { studentUserId }, disabled: !this.config.codeRunner.enabled });
        const last = await tx.codeRun.findFirst({
          where: { attemptId: attempt.id, questionId, studentUserId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });
        return last?.id ?? null;
      });
      return { run: runId ? await this.read(runId) : null };
    } catch (error) {
      if (error instanceof OutOfContext) return this.denied(studentUserId, activityId, now, LATEST_ROUTE, requestId);
      throw error;
    }
  }

  /** One run of the session student; another student's or an unknown id is the same 404. */
  async get(studentUserId: string, runId: string): Promise<CodeRun> {
    const now = this.clock.now();
    const found = await this.prisma.runInTransaction(async (tx) => {
      await settleStaleRuns(tx, this.audit, { now, scope: { studentUserId }, disabled: !this.config.codeRunner.enabled });
      return tx.codeRun.count({ where: { id: runId, studentUserId } });
    });
    if (found === 0) throw notFound();
    return this.read(runId);
  }

  /**
   * The question the student may run, under the activity's and the attempt's `FOR SHARE`: an
   * EXERCISE of the context that is neither closed nor of an inactive class, and a CODE question of
   * it. Anything else throws `OutOfContext`.
   */
  private async runnableQuestion(
    tx: Tx,
    studentUserId: string,
    activityId: string,
    questionId: string,
    now: Date,
  ): Promise<{ attempt: OwnAttemptContext["attempt"]; question: RunnableQuestion }> {
    const context = await this.loader.ownAttempt(studentUserId, activityId, now, tx);
    if (!context || context.type !== "EXERCISE" || context.activityStatus !== "ACTIVE" || !context.classActive) throw new OutOfContext();
    const question = await tx.classActivityQuestion.findFirst({
      where: { id: questionId, activityId, type: "CODE" },
      select: { language: { select: { execution: true } }, _count: { select: { testCases: { where: { visibility: "PUBLIC" } } } } },
    });
    if (!question) throw new OutOfContext();
    // `execution` is CHECKed to the contract's profile keys (research B5).
    return {
      attempt: context.attempt,
      question: { execution: (question.language?.execution ?? null) as ExecutionKey | null, publicCaseCount: question._count.testCases },
    };
  }

  private async read(runId: string): Promise<CodeRun> {
    return toStudentRun(await this.prisma.codeRun.findUniqueOrThrow({ where: { id: runId }, select: CODE_RUN_SELECT }));
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
