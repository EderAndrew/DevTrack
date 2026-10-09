import { Inject, Injectable } from "@nestjs/common";
import type {
  ActivityStatus,
  ActivityType,
  ExecutionMode,
  LatePolicy,
  SaveAnswersRequest,
  SaveAnswersResult,
  StudentActivity,
  SubmitAttemptRequest,
  WorkQuestionType,
} from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound, rateLimited } from "../../platform/http/errors";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";
import { type ActivityFacts, assignmentSchedule } from "../activities/status/facts";
import { answerFits, answerOfRow, columnsOf, isBlankAnswer, progressAuditDue, sameAnswer } from "../activities/status/answers";
import { decideOperation, type OperationRefusal, type StudentOperation, wouldBeLate } from "../activities/status/operations";
import { completeAttempt } from "../activities/results/complete-attempt";
import { AnswerSaveGuard, type GuardedAnswer, type GuardedAttempt } from "./answer-save-guard";
import { registerSubmission } from "../activities/submission/register-submission";
import { MyActivitiesService } from "./my-activities.service";
import { StudentActivityLoader } from "./student-activity-loader";

const MINUTE_SEC = 60;
const HOUR_SEC = 3_600;

/** The route patterns `student_access.denied` names (never the URL with its ids). */
const ROUTES: Record<StudentOperation, string> = {
  START: "/me/activities/:activityId/attempt",
  SAVE: "/me/activities/:activityId/attempt/answers",
  SUBMIT: "/me/activities/:activityId/attempt/submit",
  RETRY: "/me/activities/:activityId/attempts",
  COMPLETE: "/me/activities/:activityId/attempts/:number/complete",
};

/** The activity, in the student's context, under `FOR SHARE`: a teacher's close waits for it (research P9). */
interface ContextRow {
  class_id: string;
  type: ActivityType;
  /** 015: NORMAL or CONTROLLED (an EXERCISE is always NORMAL, CHECK). */
  execution_mode: ExecutionMode;
  status: ActivityStatus;
  /** ASSIGNMENT only (013 K1). */
  deadline: Date | null;
  late_policy: LatePolicy | null;
  question_count: number;
  class_status: string;
  released: boolean;
}

interface AttemptRow {
  id: string;
  number: number;
  status: "IN_PROGRESS" | "SUBMITTED";
  started_at: Date;
  last_progress_audited_at: Date | null;
}

/** Thrown inside the transaction when the activity is out of the student's context (→ 404 after the rollback). */
class OutOfContext extends Error {}

/**
 * A submission whose pending answers grew faster than typing allows (015/FR-013c, research F7): the
 * whole submit rolls back (422); the refusal is then recorded on its own by `record`.
 */
class TypingRefused extends Error {
  constructor(readonly record: (tx: Tx) => Promise<unknown>) {
    super("TYPING_LIMIT_EXCEEDED");
  }
}

/** A rule refusal (409) of a start, save or submit, audited after the rollback (contracts/audit-events.md). */
class Refused extends Error {
  constructor(readonly code: OperationRefusal | "ANSWER_CHANGED_ELSEWHERE") {
    super(code);
  }
}

/**
 * The student's attempt (012 US3, US4, research P7–P10, P18–P20): start (one attempt per student and
 * activity, `INSERT … ON CONFLICT DO NOTHING`), the answers' saves (one row per question with a
 * revision, under the attempt's row lock: SAVED / UNCHANGED / CONFLICT) and the single submission. Every query starts from the
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
    private readonly answerGuard: AnswerSaveGuard,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Starts the attempt, or returns the existing one (no event); 409 when the rules refuse it. */
  async start(studentUserId: string, activityId: string, requestId: string | null): Promise<StudentActivity> {
    await this.guarded("START", studentUserId, activityId, requestId, async (tx, now) => {
      const context = await lockContext(tx, studentUserId, activityId, now);
      await this.assertStartRate(tx, context, studentUserId);
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
        metadata: { activityId, classId: context.class_id, afterDeadline: facts.type === "ASSIGNMENT" && wouldBeLate(facts), attemptNumber: 1 },
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
      await this.assertRate(tx, "activity-saves", studentUserId, this.config.rateLimit.activitySavesPerMinute, MINUTE_SEC);
      const attempt = await findAttempt(tx, activityId, studentUserId, true);
      const outcome = decideOperation("SAVE", factsOf(context, attempt, now));
      if (outcome.kind === "REFUSED") throw new Refused(outcome.code);
      const attemptId = attempt!.id;
      const guarded = guardedAttempt(context, attempt!, activityId, studentUserId);
      const guard = (items: GuardedAnswer[]) => this.answerGuard.check(tx, guarded, items, now);

      const { questions, stored, results, saved } = await writeAnswers(tx, { activityId, attemptId, answers: body.answers, now, guard });
      if (saved > 0) await this.recordProgress(tx, { studentUserId, activityId, attempt: attempt!, context, questions, stored, now, requestId });
      return { savedAt: now.toISOString(), results };
    });
  }

  /**
   * Submits the attempt (FR-024, FR-025, research P9), all or nothing in one transaction: the activity
   * `FOR SHARE` (a close waits) and the attempt `FOR UPDATE`; an attempt already submitted returns its
   * submission (no event, nothing written); otherwise the rules, the pending answers under the save's
   * revision rule — a stale revision with other content aborts with `409 ANSWER_CHANGED_ELSEWHERE` —,
   * then the submission, its grading and `activity_submission.created`.
   */
  async submit(studentUserId: string, activityId: string, body: SubmitAttemptRequest, requestId: string | null): Promise<StudentActivity> {
    await this.guarded("SUBMIT", studentUserId, activityId, requestId, async (tx, now) => {
      const context = await lockContext(tx, studentUserId, activityId, now);
      await this.assertRate(tx, "activity-submits", studentUserId, this.config.rateLimit.activitySubmitsPerHour, HOUR_SEC);
      const attempt = await findAttempt(tx, activityId, studentUserId, true);
      const facts = factsOf(context, attempt, now);
      const outcome = decideOperation("SUBMIT", facts);
      if (outcome.kind === "REFUSED") throw new Refused(outcome.code);
      if (outcome.kind === "REPEAT" || facts.type !== "ASSIGNMENT") return;
      const attemptId = attempt!.id;

      if (body.answers.length > 0) {
        const guarded = guardedAttempt(context, attempt!, activityId, studentUserId);
        const guard = (items: GuardedAnswer[]) => this.answerGuard.check(tx, guarded, items, now);
        const { results, saved } = await writeAnswers(tx, { activityId, attemptId, answers: body.answers, now, guard });
        if (results.some((result) => result.outcome === "CONFLICT")) throw new Refused("ANSWER_CHANGED_ELSEWHERE");
        const refused = body.answers.filter((item) => results.some((result) => result.questionId === item.questionId && result.outcome === "TYPING_LIMIT_EXCEEDED"));
        if (refused.length > 0) throw new TypingRefused((recordTx) => this.recordTypingRefusal(recordTx, guarded, refused, now));
        if (saved > 0) await tx.activityAttempt.update({ where: { id: attemptId }, data: { lastSavedAt: now } });
      }
      const late = wouldBeLate(facts);
      const submission = await registerSubmission(tx, { attemptId, activityId, studentUserId, now, late });
      await this.audit.record(tx, {
        type: "activity_submission.created",
        actorType: "USER",
        actorUserId: studentUserId,
        targetType: "ACTIVITY_SUBMISSION",
        targetId: submission.submissionId,
        requestId,
        metadata: {
          activityId,
          attemptId,
          late,
          blankCount: submission.blankCount,
          questionCount: submission.questionCount,
          pendingTeacherCount: submission.pendingTeacherCount,
        },
      });
    });
    return this.myActivities.get(studentUserId, activityId, requestId);
  }

  /**
   * "Refazer" (013/FR-005, research K4): attempt `afterNumber + 1`, blank, only after attempt
   * `afterNumber` — the latest — is concluded. A repeat (double click, a retried request) finds that
   * attempt already open and returns it with no event; concurrent requests insert it once
   * (`ON CONFLICT DO NOTHING` over the number and the one-open-attempt UNIQUE).
   */
  async retry(studentUserId: string, activityId: string, afterNumber: number, requestId: string | null): Promise<StudentActivity> {
    await this.guarded("RETRY", studentUserId, activityId, requestId, async (tx, now) => {
      const context = await lockContext(tx, studentUserId, activityId, now);
      if (context.type === "EXERCISE") await this.assertStartRate(tx, context, studentUserId);
      const attempt = await findAttempt(tx, activityId, studentUserId, true);
      const outcome = decideOperation("RETRY", factsOf(context, attempt, now), afterNumber);
      if (outcome.kind === "REFUSED") throw new Refused(outcome.code);
      if (outcome.kind === "REPEAT") return;

      const number = afterNumber + 1;
      const inserted = await tx.activityAttempt.createMany({ data: [{ activityId, studentUserId, number, startedAt: now }], skipDuplicates: true });
      if (inserted.count === 0) return; // Another tab or click created it first: same attempt, no event.
      const created = await tx.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId, number }, select: { id: true } });
      await this.audit.record(tx, {
        type: "activity_attempt.started",
        actorType: "USER",
        actorUserId: studentUserId,
        targetType: "ACTIVITY_ATTEMPT",
        targetId: created.id,
        requestId,
        metadata: { activityId, classId: context.class_id, afterDeadline: false, attemptNumber: number },
      });
    });
    return this.myActivities.get(studentUserId, activityId, requestId);
  }

  /**
   * "Concluir exercícios" (013/FR-007–FR-010a, research K5): in one transaction under the 012 locks
   * (activity `FOR SHARE`, attempt `FOR UPDATE`), the pending answers by the save's revision rule — a
   * stale revision with other content aborts with `409 ANSWER_CHANGED_ELSEWHERE` —, then the
   * conclusion with its results and `exercise_attempt.completed`. Concluding an attempt already
   * concluded returns it as it is (no event, nothing written).
   */
  async complete(
    studentUserId: string,
    activityId: string,
    number: number,
    body: SubmitAttemptRequest,
    requestId: string | null,
  ): Promise<StudentActivity> {
    await this.guarded("COMPLETE", studentUserId, activityId, requestId, async (tx, now) => {
      const context = await lockContext(tx, studentUserId, activityId, now);
      if (context.type === "EXERCISE") await this.assertStartRate(tx, context, studentUserId);
      const attempt = await findAttempt(tx, activityId, studentUserId, true);
      const outcome = decideOperation("COMPLETE", factsOf(context, attempt, now), number);
      if (outcome.kind === "REFUSED") throw new Refused(outcome.code);
      if (outcome.kind === "REPEAT") return;
      const attemptId = attempt!.id;

      if (body.answers.length > 0) {
        const { results, saved } = await writeAnswers(tx, { activityId, attemptId, answers: body.answers, now });
        if (results.some((result) => result.outcome === "CONFLICT")) throw new Refused("ANSWER_CHANGED_ELSEWHERE");
        if (saved > 0) await tx.activityAttempt.update({ where: { id: attemptId }, data: { lastSavedAt: now } });
      }
      const completed = await completeAttempt(tx, {
        attemptId,
        attemptNumber: attempt!.number,
        activityId,
        classId: context.class_id,
        studentUserId,
        now,
      });
      await this.audit.record(tx, {
        type: "exercise_attempt.completed",
        actorType: "USER",
        actorUserId: studentUserId,
        targetType: "ACTIVITY_ATTEMPT",
        targetId: attemptId,
        requestId,
        metadata: { activityId, classId: context.class_id, attemptNumber: attempt!.number, ...completed },
      });
    });
    return this.myActivities.get(studentUserId, activityId, requestId);
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
    operation: StudentOperation,
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
      if (error instanceof TypingRefused) {
        await this.prisma.runInTransaction((tx) => error.record(tx));
        throw new AppException("TYPING_LIMIT_EXCEEDED");
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

  /**
   * Records a submit's typing refusal after its rollback (015/FR-013c): the guard checks the refused
   * answers again under the attempt's lock, still open, and writes their `TYPING_LIMIT_EXCEEDED` events.
   */
  private async recordTypingRefusal(tx: Tx, attempt: GuardedAttempt, answers: readonly GuardedAnswer[], now: Date): Promise<void> {
    const current = await findAttempt(tx, attempt.activityId, attempt.studentUserId, true);
    if (current?.id !== attempt.id || current.status !== "IN_PROGRESS") return;
    await this.answerGuard.check(tx, attempt, answers, now);
  }

  /**
   * Starts count with the submissions of an ASSIGNMENT (012, research P20) and with the practice
   * attempts of an EXERCISE (013 K16), per student and hour.
   */
  private assertStartRate(tx: Tx, context: ContextRow, studentUserId: string): Promise<void> {
    return context.type === "EXERCISE"
      ? this.assertRate(tx, "exercise-attempts", studentUserId, this.config.rateLimit.exerciseAttemptsPerHour, HOUR_SEC)
      : this.assertRate(tx, "activity-submits", studentUserId, this.config.rateLimit.activitySubmitsPerHour, HOUR_SEC);
  }

  /**
   * Per student (research P20): saves per minute; starts and submissions per hour. On the
   * operation's `tx`, which holds the attempt's locks: from the pool, 10 concurrent starts filled it
   * and each waited for a second connection until the transaction timed out.
   */
  private async assertRate(tx: Tx, scope: string, studentUserId: string, limit: number, windowSec: number): Promise<void> {
    const state = await this.rateLimit.hit(scope, studentUserId, { limit, windowSec }, tx);
    if (state.blocked) throw rateLimited(state.retryAfterSec);
  }
}

/** Published, not cancelled, of a class where the student is ACTIVE (research P18); else `OutOfContext`. */
async function lockContext(tx: Tx, studentUserId: string, activityId: string, now: Date): Promise<ContextRow> {
  const rows = await tx.$queryRaw<ContextRow[]>`
    SELECT ca.class_id, ca.type::text AS type, ca.execution_mode::text AS execution_mode, ca.status::text AS status, ca.deadline, ca.late_policy::text AS late_policy, ca.question_count,
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

/**
 * The student's latest attempt (number 1 of an ASSIGNMENT; the open or latest practice attempt of an
 * EXERCISE, 013 K3), `FOR UPDATE` when the answers change (research P8). Its own `status` says
 * whether it was submitted (the submission is written in the same transaction): after waiting for the
 * lock, READ COMMITTED returns the row's latest version, while a subquery on another table would still
 * read the statement's older snapshot.
 */
async function findAttempt(tx: Tx, activityId: string, studentUserId: string, lock: boolean): Promise<AttemptRow | null> {
  const rows = lock
    ? await tx.$queryRaw<AttemptRow[]>`
        SELECT a.id, a.number, a.status::text AS status, a.started_at, a.last_progress_audited_at
        FROM activity_attempts a
        WHERE a.activity_id = ${activityId}::uuid AND a.student_user_id = ${studentUserId}::uuid
        ORDER BY a.number DESC LIMIT 1
        FOR UPDATE OF a`
    : await tx.$queryRaw<AttemptRow[]>`
        SELECT a.id, a.number, a.status::text AS status, a.started_at, a.last_progress_audited_at
        FROM activity_attempts a
        WHERE a.activity_id = ${activityId}::uuid AND a.student_user_id = ${studentUserId}::uuid
        ORDER BY a.number DESC LIMIT 1`;
  return rows[0] ?? null;
}

type StoredAnswer = { questionId: string; questionType: WorkQuestionType; text: string | null; alternativeId: string | null; source: string | null; revision: number };

/**
 * Writes answers under the revision rule (research P8), each on its own: equal content → UNCHANGED;
 * `baseRevision` equal to the stored one (or no row yet) → written with `revision + 1`, SAVED;
 * otherwise CONFLICT with the server's answer. Any answer that doesn't fit its question → 422 before
 * anything is written. Since 015 the answers about to be written first pass the `guard` (the
 * `AnswerSaveGuard` hook): a refused one keeps the stored answer and its revision, TYPING_LIMIT_EXCEEDED
 * (research F7). The attempt is locked by the caller.
 */
async function writeAnswers(
  tx: Tx,
  input: {
    activityId: string;
    attemptId: string;
    answers: SaveAnswersRequest["answers"];
    now: Date;
    guard?: (answers: GuardedAnswer[]) => Promise<("OK" | "TYPING_LIMIT_EXCEEDED")[]>;
  },
): Promise<{ questions: Map<string, Question>; stored: Map<string, StoredAnswer>; results: SaveAnswersResult["results"]; saved: number }> {
  const { activityId, attemptId, now } = input;
  const questions = await loadQuestions(tx, activityId);
  for (const item of input.answers) {
    const question = questions.get(item.questionId);
    if (!question || !answerFits(question, item.answer)) throw new AppException("INVALID_ANSWER");
  }
  const stored = new Map(
    (
      await tx.activityAnswer.findMany({
        where: { attemptId },
        select: { questionId: true, questionType: true, text: true, alternativeId: true, source: true, revision: true },
      })
    ).map((row): [string, StoredAnswer] => [row.questionId, row]),
  );
  const writable = input.answers.filter((item) => {
    const current = stored.get(item.questionId);
    return !current || (!sameAnswer(answerOfRow(current), item.answer) && current.revision === item.baseRevision);
  });
  const verdicts = input.guard && writable.length > 0 ? await input.guard(writable.map(({ questionId, answer }) => ({ questionId, answer }))) : [];
  const refused = new Set(writable.filter((_, index) => verdicts[index] === "TYPING_LIMIT_EXCEEDED").map((item) => item.questionId));
  const results: SaveAnswersResult["results"] = [];
  let saved = 0;
  for (const item of input.answers) {
    const current = stored.get(item.questionId);
    const question = questions.get(item.questionId)!;
    if (current && sameAnswer(answerOfRow(current), item.answer)) {
      results.push({ questionId: item.questionId, outcome: "UNCHANGED", revision: current.revision });
    } else if (current && current.revision !== item.baseRevision) {
      results.push({ questionId: item.questionId, outcome: "CONFLICT", revision: current.revision, answer: answerOfRow(current) });
    } else if (refused.has(item.questionId)) {
      results.push({ questionId: item.questionId, outcome: "TYPING_LIMIT_EXCEEDED", revision: current?.revision ?? 0 });
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
  return { questions, stored, results, saved };
}

/** The attempt as the `AnswerSaveGuard` sees it (015 research F7). */
function guardedAttempt(context: ContextRow, attempt: AttemptRow, activityId: string, studentUserId: string): GuardedAttempt {
  return { id: attempt.id, activityId, studentUserId, executionMode: context.execution_mode, startedAt: attempt.started_at };
}

/** The facts the operation rules read; a submission's grading and the results don't matter to them. */
function factsOf(context: ContextRow, attempt: AttemptRow | null, now: Date): ActivityFacts {
  const classActive = context.class_status === "ACTIVE";
  if (context.type === "EXERCISE") {
    return {
      type: "EXERCISE",
      activityStatus: context.status,
      classActive,
      latestAttempt: attempt && { number: attempt.number, status: attempt.status },
      awaitingCorrection: false,
      now,
    };
  }
  return {
    type: "ASSIGNMENT",
    activityStatus: context.status,
    ...assignmentSchedule({ deadline: context.deadline, latePolicy: context.late_policy }),
    classActive,
    attempt: attempt && { status: attempt.status },
    submission: attempt?.status === "SUBMITTED" ? { late: false, gradingComplete: false } : null,
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
