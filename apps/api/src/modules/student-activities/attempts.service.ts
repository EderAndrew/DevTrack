import { Inject, Injectable } from "@nestjs/common";
import type { ActivityStatus, LatePolicy, SaveAnswersRequest, SaveAnswersResult, StudentActivity, WorkQuestionType } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound, rateLimited } from "../../platform/http/errors";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";
import type { ActivityFacts } from "../activities/status/facts";
import { answerFits, answerOfRow, columnsOf, isBlankAnswer, progressAuditDue, sameAnswer } from "../activities/status/answers";
import { decideOperation, type OperationRefusal, type StudentOperation, wouldBeLate } from "../activities/status/operations";
import { MyActivitiesService } from "./my-activities.service";
import { StudentActivityLoader } from "./student-activity-loader";

const MINUTE_SEC = 60;
const HOUR_SEC = 3_600;

/** The route patterns `student_access.denied` names (never the URL with its ids). */
const ROUTES: Record<Exclude<StudentOperation, "SUBMIT">, string> = {
  START: "/me/activities/:activityId/attempt",
  SAVE: "/me/activities/:activityId/attempt/answers",
};

/** The activity, in the student's context, under `FOR SHARE`: a teacher's close waits for it (research P9). */
interface ContextRow {
  class_id: string;
  status: ActivityStatus;
  deadline: Date;
  late_policy: LatePolicy;
  question_count: number;
  class_status: string;
  released: boolean;
}

interface AttemptRow {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED";
  last_progress_audited_at: Date | null;
  submitted: boolean;
}

/** Thrown inside the transaction when the activity is out of the student's context (→ 404 after the rollback). */
class OutOfContext extends Error {}

/** A rule refusal (409) of a start or save, audited after the rollback (contracts/audit-events.md). */
class Refused extends Error {
  constructor(readonly code: OperationRefusal) {
    super(code);
  }
}

/**
 * The student's attempt (012 US3, research P7, P8, P10, P18–P20): start (one attempt per student and
 * activity, `INSERT … ON CONFLICT DO NOTHING`) and the answers' saves (one row per question with a
 * revision, under the attempt's row lock: SAVED / UNCHANGED / CONFLICT). Every query starts from the
 * session user's ACTIVE enrollment; out of context → 404 (and `student_access.denied` for an existing
 * activity); the operation rules of `status/operations.ts` with the server clock decide the rest. A
 * refusal writes `activity_submission.rejected` in its own transaction. Code is stored as text and
 * never executed (constitution IV).
 */
@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly loader: StudentActivityLoader,
    private readonly myActivities: MyActivitiesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Starts the attempt, or returns the existing one (no event); 409 when the rules refuse it. */
  async start(studentUserId: string, activityId: string, requestId: string | null): Promise<StudentActivity> {
    await this.guarded("START", studentUserId, activityId, requestId, async (tx, now) => {
      const context = await lockContext(tx, studentUserId, activityId, now);
      await this.assertRate("activity-submits", studentUserId, this.config.rateLimit.activitySubmitsPerHour, HOUR_SEC);
      const attempt = await findAttempt(tx, activityId, studentUserId, false);
      const facts = factsOf(context, attempt, now);
      const outcome = decideOperation("START", facts);
      if (outcome.kind === "REFUSED") throw new Refused(outcome.code);
      if (outcome.kind === "REPEAT") return;

      const inserted = await tx.activityAttempt.createMany({ data: [{ activityId, studentUserId, startedAt: now }], skipDuplicates: true });
      if (inserted.count === 0) return; // Another tab or click inserted it first: same attempt, no event.
      const created = await tx.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId, number: 1 }, select: { id: true } });
      await this.audit.record(tx, {
        type: "activity_attempt.started",
        actorType: "USER",
        actorUserId: studentUserId,
        targetType: "ACTIVITY_ATTEMPT",
        targetId: created.id,
        requestId,
        metadata: { activityId, classId: context.class_id, afterDeadline: wouldBeLate(facts) },
      });
    });
    return this.myActivities.get(studentUserId, activityId, requestId);
  }

  /**
   * Saves up to 10 answers (research P8), each on its own: equal content → UNCHANGED; `baseRevision`
   * equal to the stored one (or no row yet) → written with `revision + 1`, SAVED; otherwise CONFLICT
   * with the server's answer. Any answer that doesn't fit its question → 422 and nothing is written.
   */
  saveAnswers(studentUserId: string, activityId: string, body: SaveAnswersRequest, requestId: string | null): Promise<SaveAnswersResult> {
    return this.guarded("SAVE", studentUserId, activityId, requestId, async (tx, now) => {
      const context = await lockContext(tx, studentUserId, activityId, now);
      await this.assertRate("activity-saves", studentUserId, this.config.rateLimit.activitySavesPerMinute, MINUTE_SEC);
      const attempt = await findAttempt(tx, activityId, studentUserId, true);
      const outcome = decideOperation("SAVE", factsOf(context, attempt, now));
      if (outcome.kind === "REFUSED") throw new Refused(outcome.code);
      const attemptId = attempt!.id;

      const questions = await loadQuestions(tx, activityId);
      for (const item of body.answers) {
        const question = questions.get(item.questionId);
        if (!question || !answerFits(question, item.answer)) throw new AppException("INVALID_ANSWER");
      }

      const stored = new Map(
        (
          await tx.activityAnswer.findMany({
            where: { attemptId },
            select: { questionId: true, questionType: true, text: true, alternativeId: true, source: true, revision: true },
          })
        ).map((row) => [row.questionId, row]),
      );
      const results: SaveAnswersResult["results"] = [];
      let saved = 0;
      for (const item of body.answers) {
        const current = stored.get(item.questionId);
        const question = questions.get(item.questionId)!;
        if (current && sameAnswer(answerOfRow(current), item.answer)) {
          results.push({ questionId: item.questionId, outcome: "UNCHANGED", revision: current.revision });
        } else if (current && current.revision !== item.baseRevision) {
          results.push({ questionId: item.questionId, outcome: "CONFLICT", revision: current.revision, answer: answerOfRow(current) });
        } else {
          const revision = (current?.revision ?? 0) + 1;
          const columns = columnsOf(item.answer);
          await tx.activityAnswer.upsert({
            where: { attemptId_questionId: { attemptId, questionId: item.questionId } },
            create: { attemptId, activityId, questionId: item.questionId, questionType: question.type, ...columns, revision, savedAt: now },
            update: { ...columns, revision, savedAt: now },
          });
          stored.set(item.questionId, { questionId: item.questionId, questionType: question.type, ...columns, revision });
          results.push({ questionId: item.questionId, outcome: "SAVED", revision });
          saved += 1;
        }
      }
      if (saved > 0) await this.recordProgress(tx, { studentUserId, activityId, attempt: attempt!, context, questions, stored, now, requestId });
      return { savedAt: now.toISOString(), results };
    });
  }

  /** `last_saved_at`, and `activity_attempt.progress_saved` once per 15 minutes with counts only (research P19). */
  private async recordProgress(
    tx: Tx,
    input: {
      studentUserId: string;
      activityId: string;
      attempt: AttemptRow;
      context: ContextRow;
      questions: Map<string, Question>;
      stored: Map<string, { questionType: WorkQuestionType; text: string | null; alternativeId: string | null; source: string | null }>;
      now: Date;
      requestId: string | null;
    },
  ): Promise<void> {
    const { attempt, now } = input;
    const audit = progressAuditDue(attempt.last_progress_audited_at, now);
    await tx.activityAttempt.update({
      where: { id: attempt.id },
      data: { lastSavedAt: now, ...(audit ? { lastProgressAuditedAt: now } : {}) },
    });
    if (!audit) return;
    const answeredCount = [...input.stored.entries()].filter(([questionId, row]) => {
      const question = input.questions.get(questionId);
      return question !== undefined && !isBlankAnswer(question, answerOfRow(row));
    }).length;
    await this.audit.record(tx, {
      type: "activity_attempt.progress_saved",
      actorType: "USER",
      actorUserId: input.studentUserId,
      targetType: "ACTIVITY_ATTEMPT",
      targetId: attempt.id,
      requestId: input.requestId,
      metadata: { activityId: input.activityId, answeredCount, questionCount: input.context.question_count },
    });
  }

  /**
   * Runs one operation in a transaction with the server clock; after the rollback, an activity out of
   * context answers 404 (auditing `student_access.denied` when it exists) and a rule refusal writes
   * `activity_submission.rejected` before its 409, each in its own write (no domain change to commit with).
   */
  private async guarded<T>(
    operation: Exclude<StudentOperation, "SUBMIT">,
    studentUserId: string,
    activityId: string,
    requestId: string | null,
    fn: (tx: Tx, now: Date) => Promise<T>,
  ): Promise<T> {
    const now = this.clock.now();
    try {
      return await this.prisma.runInTransaction((tx) => fn(tx, now));
    } catch (error) {
      if (error instanceof OutOfContext) {
        const reason = await this.loader.deniedReason(studentUserId, activityId, now);
        if (reason) {
          await this.audit.record(this.prisma, {
            type: "student_access.denied",
            actorType: "USER",
            actorUserId: studentUserId,
            targetType: "CLASS_ACTIVITY",
            targetId: activityId,
            requestId,
            metadata: { route: ROUTES[operation], reason },
          });
        }
        throw notFound();
      }
      if (error instanceof Refused) {
        await this.audit.record(this.prisma, {
          type: "activity_submission.rejected",
          actorType: "USER",
          actorUserId: studentUserId,
          targetType: "CLASS_ACTIVITY",
          targetId: activityId,
          requestId,
          metadata: { operation, code: error.code },
        });
        throw new AppException(error.code);
      }
      throw error;
    }
  }

  /** Per student (research P20): saves per minute; starts and submissions per hour. */
  private async assertRate(scope: string, studentUserId: string, limit: number, windowSec: number): Promise<void> {
    const state = await this.rateLimit.hit(scope, studentUserId, { limit, windowSec });
    if (state.blocked) throw rateLimited(state.retryAfterSec);
  }
}

/** Published, not cancelled, of a class where the student is ACTIVE (research P18); else `OutOfContext`. */
async function lockContext(tx: Tx, studentUserId: string, activityId: string, now: Date): Promise<ContextRow> {
  const rows = await tx.$queryRaw<ContextRow[]>`
    SELECT ca.class_id, ca.status::text AS status, ca.deadline, ca.late_policy::text AS late_policy, ca.question_count,
           c.status::text AS class_status, (ca.result_released_at IS NOT NULL) AS released
    FROM class_activities ca
    JOIN classes c ON c.id = ca.class_id
    WHERE ca.id = ${activityId}::uuid
      AND ca.status <> 'CANCELLED'
      AND ca.publish_at <= ${now}
      AND EXISTS (SELECT 1 FROM enrollments e WHERE e.class_id = ca.class_id AND e.student_user_id = ${studentUserId}::uuid AND e.status = 'ACTIVE')
    FOR SHARE OF ca`;
  if (rows.length === 0) throw new OutOfContext();
  return rows[0]!;
}

/** The student's attempt (number 1), `FOR UPDATE` when the answers change (research P8). */
async function findAttempt(tx: Tx, activityId: string, studentUserId: string, lock: boolean): Promise<AttemptRow | null> {
  const rows = lock
    ? await tx.$queryRaw<AttemptRow[]>`
        SELECT a.id, a.status::text AS status, a.last_progress_audited_at,
               EXISTS (SELECT 1 FROM activity_submissions s WHERE s.attempt_id = a.id) AS submitted
        FROM activity_attempts a
        WHERE a.activity_id = ${activityId}::uuid AND a.student_user_id = ${studentUserId}::uuid AND a.number = 1
        FOR UPDATE OF a`
    : await tx.$queryRaw<AttemptRow[]>`
        SELECT a.id, a.status::text AS status, a.last_progress_audited_at,
               EXISTS (SELECT 1 FROM activity_submissions s WHERE s.attempt_id = a.id) AS submitted
        FROM activity_attempts a
        WHERE a.activity_id = ${activityId}::uuid AND a.student_user_id = ${studentUserId}::uuid AND a.number = 1`;
  return rows[0] ?? null;
}

/** The facts the operation rules read; a submission's grading doesn't matter to them. */
function factsOf(context: ContextRow, attempt: AttemptRow | null, now: Date): ActivityFacts {
  return {
    activityStatus: context.status,
    deadline: context.deadline,
    latePolicy: context.late_policy,
    classActive: context.class_status === "ACTIVE",
    attempt: attempt && { status: attempt.status },
    submission: attempt?.submitted ? { late: false, gradingComplete: false } : null,
    released: context.released,
    now,
  };
}

interface Question {
  type: WorkQuestionType;
  starterCode: string | null;
  alternativeIds: string[];
}

/** The snapshot questions of the activity: an id of another activity is simply absent (→ 422). */
async function loadQuestions(tx: Tx, activityId: string): Promise<Map<string, Question>> {
  const rows = await tx.classActivityQuestion.findMany({
    where: { activityId },
    select: { id: true, type: true, starterCode: true, alternatives: { select: { id: true } } },
  });
  return new Map(
    rows.map((row) => [row.id, { type: row.type, starterCode: row.starterCode, alternativeIds: row.alternatives.map((alternative) => alternative.id) }]),
  );
}
