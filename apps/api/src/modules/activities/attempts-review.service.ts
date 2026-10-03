import { Inject, Injectable } from "@nestjs/common";
import {
  type ActivityStatus,
  centsToGrade,
  type GradeSubmissionRequest,
  gradeToCents,
  type LatePolicy,
  type PendingReason,
  type QuestionGrading,
  type TeacherAttempt,
} from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound, rateLimited } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { decideByTeacher } from "../works/grading/decide";
import { GradingRuleError } from "../works/grading/strategy";
import { computeWorkGrade } from "../works/grading/work-grade";
import { decimalToCents } from "./activity-query";
import type { ActivityFacts } from "./status/facts";
import { answerOfRow } from "./status/answers";
import { acceptanceRefusal } from "./status/operations";
import { registerSubmission } from "./submission/register-submission";

const HOUR_SEC = 3_600;

const ATTEMPT_SELECT = {
  id: true,
  status: true,
  startedAt: true,
  lastSavedAt: true,
  student: { select: { userId: true, user: { select: { name: true } } } },
  answers: {
    orderBy: { question: { position: "asc" } },
    select: { questionId: true, questionType: true, text: true, alternativeId: true, source: true, savedAt: true },
  },
  submission: {
    select: {
      id: true,
      submittedAt: true,
      late: true,
      acceptedById: true,
      blankCount: true,
      grade: true,
      gradePartial: true,
      generalFeedback: true,
      version: true,
      gradings: {
        orderBy: { question: { position: "asc" } },
        select: { questionId: true, status: true, nature: true, finalGrade: true, teacherGrade: true, pendingReason: true, feedback: true },
      },
    },
  },
} as const satisfies Prisma.ActivityAttemptSelect;

type AttemptRecord = Prisma.ActivityAttemptGetPayload<{ select: typeof ATTEMPT_SELECT }>;

/** A stored grading with what the 011 rules need of its question. */
const GRADING_SELECT = {
  questionId: true,
  status: true,
  nature: true,
  finalGrade: true,
  teacherGrade: true,
  pendingReason: true,
  feedback: true,
  question: { select: { value: true, gradingStrategy: true } },
} as const satisfies Prisma.ActivityQuestionGradingSelect;

type GradingRecord = Prisma.ActivityQuestionGradingGetPayload<{ select: typeof GRADING_SELECT }>;

/** Empty feedback is no feedback. */
const feedbackOf = (text: string | null | undefined): string | null => (text && text.trim() !== "" ? text : null);

/**
 * The teacher's side of one student's attempt (012 US5, FR-006, FR-006b, research P9, P13): the
 * attempt with its answers, gradings and submission; the teacher's grades through the 011
 * `decideByTeacher` and `computeWorkGrade` at the submission's `version`; and the acceptance of a
 * saved attempt as a late submission when the student can no longer submit, through the same
 * `registerSubmission` as the student's submit. The class goes through `ClassContextPolicy`, the
 * activity by `(id, class_id)` and the attempt by `(id, activity_id)`: anything else is a 404.
 * Grades are integer hundredths; no AI and no code execution.
 */
@Injectable()
export class AttemptsReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly classes: ClassContextPolicy,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The attempt next to the answer key the activity's detail carries; read-only while not submitted. */
  async getAttempt(teacherId: string, classId: string, activityId: string, attemptId: string, db: Tx = this.prisma): Promise<TeacherAttempt> {
    await this.classes.findOwnedOrNotFound(teacherId, classId, db);
    const attempt = await db.activityAttempt.findFirst({ where: { id: attemptId, activityId, activity: { classId } }, select: ATTEMPT_SELECT });
    if (!attempt) throw notFound();
    return toTeacherAttempt(attempt);
  }

  /**
   * The teacher's grade and optional feedback per question, and the general feedback (FR-006,
   * research P13), all or nothing: the activity `FOR SHARE` (a release waits, so `afterRelease` is
   * exact) and the submission `FOR UPDATE` at the version the teacher read (`409
   * SUBMISSION_VERSION_CONFLICT`); a question of another activity → `422 UNKNOWN_QUESTION`; a grade
   * outside 0…value → `422 GRADE_OUT_OF_RANGE`. A rule's result may be overridden (the teacher's
   * review prevails). After the release the change reaches the student at once. Nothing changed →
   * the attempt as it is, no event and no new version.
   */
  async grade(
    auth: AuthContext,
    classId: string,
    activityId: string,
    attemptId: string,
    body: GradeSubmissionRequest,
    requestId: string | null,
  ): Promise<TeacherAttempt> {
    const teacherId = auth.userId;
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.assertWriteRate(teacherId);
    return this.prisma.runInTransaction(async (tx) => {
      const activity = await lockActivity(tx, classId, activityId, "SHARE");
      const attempt = await tx.activityAttempt.findFirst({ where: { id: attemptId, activityId }, select: { id: true } });
      if (!attempt) throw notFound();
      const rows = await tx.$queryRaw<{ id: string; version: number; general_feedback: string | null }[]>`
        SELECT id, version, general_feedback FROM activity_submissions
        WHERE attempt_id = ${attemptId}::uuid AND activity_id = ${activityId}::uuid FOR UPDATE`;
      const submission = rows[0];
      if (!submission) throw new AppException("NOT_SUBMITTED");
      if (submission.version !== body.version) throw new AppException("SUBMISSION_VERSION_CONFLICT");

      const stored = await tx.activityQuestionGrading.findMany({ where: { submissionId: submission.id }, select: GRADING_SELECT });
      const byQuestion = new Map(stored.map((row) => [row.questionId, row]));
      const gradings = new Map(stored.map((row) => [row.questionId, toQuestionGrading(row)]));
      const changed: { questionId: string; cents: number; feedback: string | null; overridesRule: boolean }[] = [];
      for (const decision of body.decisions) {
        const row = byQuestion.get(decision.questionId);
        if (!row) throw new AppException("UNKNOWN_QUESTION");
        const cents = gradeToCents(decision.grade);
        gradings.set(decision.questionId, withRuleError(() => decideByTeacher(gradings.get(decision.questionId)!, cents)));
        const feedback = decision.feedback === undefined ? row.feedback : feedbackOf(decision.feedback);
        const same = row.status === "DECIDED" && row.teacherGrade !== null && decimalToCents(row.teacherGrade) === cents && feedback === row.feedback;
        if (!same) changed.push({ questionId: decision.questionId, cents, feedback, overridesRule: row.status === "GRADED" });
      }
      const generalFeedback = body.generalFeedback === undefined ? submission.general_feedback : feedbackOf(body.generalFeedback);
      const generalFeedbackChanged = generalFeedback !== submission.general_feedback;
      if (changed.length === 0 && !generalFeedbackChanged) return this.getAttempt(teacherId, classId, activityId, attemptId, tx);

      const grade = withRuleError(() => computeWorkGrade([...gradings.values()], decimalToCents(activity.totalGrade)));
      const now = this.clock.now();
      for (const item of changed) {
        await tx.activityQuestionGrading.update({
          where: { submissionId_questionId: { submissionId: submission.id, questionId: item.questionId } },
          data: {
            status: "DECIDED",
            nature: "HUMAN_DECISION",
            finalGrade: centsToGrade(item.cents),
            teacherGrade: centsToGrade(item.cents),
            pendingReason: null,
            feedback: item.feedback,
            decidedById: teacherId,
            decidedAt: now,
          },
        });
      }
      await tx.activitySubmission.update({
        where: { id: submission.id },
        data: { grade: centsToGrade(grade.cents), gradePartial: grade.partial, generalFeedback, gradedAt: now, version: { increment: 1 } },
      });
      await this.audit.record(tx, {
        type: "activity_submission.graded",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "ACTIVITY_SUBMISSION",
        targetId: submission.id,
        requestId,
        metadata: {
          activityId,
          decidedCount: changed.length,
          overriddenRuleCount: changed.filter((item) => item.overridesRule).length,
          gradeCents: grade.cents,
          partial: grade.partial,
          afterRelease: activity.resultReleasedAt !== null,
          generalFeedbackChanged,
        },
      });
      return this.getAttempt(teacherId, classId, activityId, attemptId, tx);
    });
  }

  /**
   * The saved answers become the student's submission (spec FR-006b, research P9): the activity and
   * the attempt `FOR UPDATE`; an attempt already submitted returns its submission (no event); the
   * student must no longer be able to submit (deadline passed under REJECT, or activity CLOSED;
   * else `409 STUDENT_CAN_STILL_SUBMIT`) and must have saved something (else `409 NOT_STARTED`).
   * The submission is late, accepted by the teacher and graded by the same rules as the student's.
   */
  async acceptSubmission(auth: AuthContext, classId: string, activityId: string, attemptId: string, requestId: string | null): Promise<TeacherAttempt> {
    const teacherId = auth.userId;
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.assertWriteRate(teacherId);
    return this.prisma.runInTransaction(async (tx) => {
      const activity = await lockActivity(tx, classId, activityId, "UPDATE");
      const attempts = await tx.$queryRaw<{ id: string; status: "IN_PROGRESS" | "SUBMITTED"; student_user_id: string }[]>`
        SELECT id, status::text AS status, student_user_id FROM activity_attempts
        WHERE id = ${attemptId}::uuid AND activity_id = ${activityId}::uuid FOR UPDATE`;
      const attempt = attempts[0];
      if (!attempt) throw notFound();
      if (attempt.status === "SUBMITTED") return this.getAttempt(teacherId, classId, activityId, attemptId, tx);

      const now = this.clock.now();
      const saved = await tx.activityAnswer.count({ where: { attemptId } });
      const facts: ActivityFacts = {
        activityStatus: activity.status,
        deadline: activity.deadline,
        latePolicy: activity.latePolicy,
        classActive: activity.classActive,
        // FR-006b accepts saved answers: an attempt with none has nothing to deliver.
        attempt: saved > 0 ? { status: attempt.status } : null,
        submission: null,
        released: activity.resultReleasedAt !== null,
        now,
      };
      const refusal = acceptanceRefusal(facts);
      if (refusal) throw new AppException(refusal);

      const submission = await registerSubmission(tx, {
        attemptId,
        activityId,
        studentUserId: attempt.student_user_id,
        now,
        late: true,
        acceptedById: teacherId,
      });
      await this.audit.record(tx, {
        type: "activity_submission.accepted_by_teacher",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "ACTIVITY_SUBMISSION",
        targetId: submission.submissionId,
        requestId,
        metadata: {
          activityId,
          attemptId,
          reason: activity.status === "CLOSED" ? "ACTIVITY_CLOSED" : "DEADLINE_PASSED",
          blankCount: submission.blankCount,
          questionCount: submission.questionCount,
          pendingTeacherCount: submission.pendingTeacherCount,
        },
      });
      return this.getAttempt(teacherId, classId, activityId, attemptId, tx);
    });
  }

  /** Grading and accepting count with the other teacher writes (research P20). */
  private async assertWriteRate(teacherId: string): Promise<void> {
    const limit = await this.rateLimit.hit("activity-teacher-writes", teacherId, {
      limit: this.config.rateLimit.activityTeacherWritesPerHour,
      windowSec: HOUR_SEC,
    });
    if (limit.blocked) throw rateLimited(limit.retryAfterSec);
  }
}

interface LockedActivity {
  status: ActivityStatus;
  deadline: Date;
  latePolicy: LatePolicy;
  totalGrade: Prisma.Decimal;
  resultReleasedAt: Date | null;
  classActive: boolean;
}

/** The activity of this class, with its class's status, `FOR SHARE` (grading) or `FOR UPDATE` (acceptance). */
async function lockActivity(tx: Tx, classId: string, activityId: string, mode: "SHARE" | "UPDATE"): Promise<LockedActivity> {
  const rows = await tx.$queryRaw<
    { status: ActivityStatus; deadline: Date; late_policy: LatePolicy; total_grade: Prisma.Decimal; result_released_at: Date | null; class_status: string }[]
  >`
    SELECT ca.status::text AS status, ca.deadline, ca.late_policy::text AS late_policy, ca.total_grade, ca.result_released_at,
           c.status::text AS class_status
    FROM class_activities ca
    JOIN classes c ON c.id = ca.class_id
    WHERE ca.id = ${activityId}::uuid AND ca.class_id = ${classId}::uuid
    ${Prisma.raw(mode === "UPDATE" ? "FOR UPDATE OF ca" : "FOR SHARE OF ca")}`;
  const row = rows[0];
  if (!row) throw notFound();
  return {
    status: row.status,
    deadline: row.deadline,
    latePolicy: row.late_policy,
    totalGrade: row.total_grade,
    resultReleasedAt: row.result_released_at,
    classActive: row.class_status === "ACTIVE",
  };
}

/** A stored grading in the 011 shape (no suggestion: 012 runs no AI). */
function toQuestionGrading(row: GradingRecord): QuestionGrading {
  return {
    questionId: row.questionId,
    strategy: row.question.gradingStrategy,
    valueCents: decimalToCents(row.question.value),
    status: row.status,
    nature: row.nature,
    suggestedCents: null,
    teacherCents: row.teacherGrade === null ? null : decimalToCents(row.teacherGrade),
    finalCents: row.finalGrade === null ? null : decimalToCents(row.finalGrade),
    pendingReason: row.pendingReason as PendingReason | null,
  };
}

/** A grade outside the 011 range is the request's fault: `422 GRADE_OUT_OF_RANGE`. */
function withRuleError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof GradingRuleError && error.code === "GRADE_OUT_OF_RANGE") throw new AppException("GRADE_OUT_OF_RANGE");
    throw error;
  }
}

function toTeacherAttempt(attempt: AttemptRecord): TeacherAttempt {
  const submission = attempt.submission;
  return {
    id: attempt.id,
    student: { userId: attempt.student.userId, name: attempt.student.user.name },
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    lastSavedAt: attempt.lastSavedAt?.toISOString() ?? null,
    answers: attempt.answers.map((row) => ({ questionId: row.questionId, answer: answerOfRow(row), savedAt: row.savedAt.toISOString() })),
    submission: submission && {
      id: submission.id,
      submittedAt: submission.submittedAt.toISOString(),
      late: submission.late,
      acceptedByTeacher: submission.acceptedById !== null,
      blankCount: submission.blankCount,
      grade: centsToGrade(decimalToCents(submission.grade)),
      gradePartial: submission.gradePartial,
      generalFeedback: submission.generalFeedback,
      version: submission.version,
      gradings: submission.gradings.map((grading) => ({
        questionId: grading.questionId,
        status: grading.status,
        nature: grading.nature,
        finalGrade: grading.finalGrade === null ? null : centsToGrade(decimalToCents(grading.finalGrade)),
        teacherGrade: grading.teacherGrade === null ? null : centsToGrade(decimalToCents(grading.teacherGrade)),
        pendingReason: grading.pendingReason as PendingReason | null,
        feedback: grading.feedback,
      })),
    },
  };
}
