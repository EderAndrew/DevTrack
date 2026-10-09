import { Injectable } from "@nestjs/common";
import type { ActivityStatus, ActivityType, AiHelpAllowance, ExecutionMode, LatePolicy, StudentAnswer } from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { ACTIVITY_QUESTION_SELECT, aiHelpAllowanceOf, decimalToCents, nullableCents, toQuestionRow } from "../activities/activity-query";
import { type ActivityFacts, assignmentSchedule } from "../activities/status/facts";
import { type AnswerRow, answerOfRow } from "../activities/status/answers";
import type { ActivityQuestionRow } from "../activities/views/rows";
import type { ConcludedAttemptInput, StudentActivityDetailInput, StudentActivityInput } from "../activities/views/student-view";

/**
 * The session student's own attempt of one activity of their context (015 routes under
 * `/me/activities/:activityId/attempt/…`, research F4): the activity's facts and the latest attempt.
 */
export interface OwnAttemptContext {
  classActive: boolean;
  type: ActivityType;
  executionMode: ExecutionMode;
  activityStatus: ActivityStatus;
  /** ASSIGNMENT only (013 K1): the 012 deadline rule decides what the student may still do. */
  deadline: Date | null;
  latePolicy: LatePolicy | null;
  aiHelpAllowance: AiHelpAllowance;
  attempt: { id: string; status: "IN_PROGRESS" | "SUBMITTED"; startedAt: Date; submittedAt: Date | null } | null;
}

/** Why an existing activity is outside the student's context (`student_access.denied`, research P18). */
export type DeniedReason = "NOT_ENROLLED" | "NOT_PUBLISHED" | "CANCELLED";

const ACTIVITY_SELECT = {
  id: true,
  type: true,
  executionMode: true,
  aiHelpAllowance: true,
  title: true,
  instructions: true,
  status: true,
  publishAt: true,
  deadline: true,
  latePolicy: true,
  totalGrade: true,
  resultReleasedAt: true,
  schoolClass: { select: { id: true, name: true, status: true, subject: { select: { name: true } } } },
  teacher: { select: { name: true } },
  /** The EXERCISE's possible points (013/FR-003). */
  questions: { select: { points: true } },
} as const satisfies Prisma.ClassActivitySelect;

const ATTEMPT_SELECT = {
  id: true,
  activityId: true,
  number: true,
  status: true,
  startedAt: true,
  lastSavedAt: true,
  completedAt: true,
  /** EXERCISE: the results of a concluded attempt, for its points and its result view (013 K6, K10). */
  results: { select: { questionId: true, result: true, points: true, scoring: true, comment: true } },
  /** ASSIGNMENT: the AI helps delivered in it (015/FR-020). */
  _count: { select: { helpRequests: { where: { status: "DELIVERED" } } } },
  submission: {
    select: {
      submittedAt: true,
      late: true,
      acceptedById: true,
      blankCount: true,
      grade: true,
      gradePartial: true,
      generalFeedback: true,
      gradings: { orderBy: { question: { position: "asc" } }, select: { questionId: true, finalGrade: true, feedback: true } },
    },
  },
} as const satisfies Prisma.ActivityAttemptSelect;

type ActivityRow = Prisma.ClassActivityGetPayload<{ select: typeof ACTIVITY_SELECT }>;
type AttemptRow = Prisma.ActivityAttemptGetPayload<{ select: typeof ATTEMPT_SELECT }>;

/**
 * What the student may see, and only that (012/FR-007, FR-008, research P16, P18): every query
 * starts from the session user's ACTIVE enrollments, then published (`publish_at ≤ now`), not
 * cancelled activities of those classes, then the student's own attempt. An id from the path only
 * selects inside that set. Two queries whatever the number of activities; the situation is derived
 * later from these facts with the server clock, never stored.
 */
@Injectable()
export class StudentActivityLoader {
  constructor(private readonly prisma: PrismaService) {}

  /** Every activity the student may see, with the facts of their own attempt. */
  async loadAll(studentUserId: string, now: Date, canSeeResults: boolean): Promise<StudentActivityInput[]> {
    const activities = await this.prisma.classActivity.findMany({ where: visibleTo(studentUserId, now), select: ACTIVITY_SELECT });
    const attempts = await this.attemptsOf(studentUserId, activities.map((activity) => activity.id));
    return activities.map((activity) => toInput(activity, attempts.get(activity.id) ?? [], now, canSeeResults));
  }

  /** One activity in the student's context with its questions and saved answers, or null (→ 404). */
  async loadOne(studentUserId: string, activityId: string, now: Date, canSeeResults: boolean): Promise<StudentActivityDetailInput | null> {
    const activity = await this.prisma.classActivity.findFirst({
      where: { id: activityId, ...visibleTo(studentUserId, now) },
      select: { ...ACTIVITY_SELECT, questions: { orderBy: { position: "asc" }, select: ACTIVITY_QUESTION_SELECT } },
    });
    if (!activity) return null;
    const attempts = (await this.attemptsOf(studentUserId, [activity.id])).get(activity.id) ?? [];
    const latest = attempts.at(-1) ?? null;
    // ASSIGNMENT: its one attempt, submitted or not (012). EXERCISE: the open attempt only (013).
    const attempt = activity.type === "EXERCISE" && latest?.status !== "IN_PROGRESS" ? null : latest;
    const answers = attempt ? await this.answersOf(attempt.id) : [];
    // EXERCISE: the latest concluded attempt, with its answer key (013/FR-012).
    const concluded = activity.type === "EXERCISE" ? attempts.filter((row) => row.completedAt !== null).at(-1) : undefined;
    return {
      ...toInput(activity, attempts, now, canSeeResults),
      aiHelpUsed: attempts.reduce((sum, row) => sum + row._count.helpRequests, 0),
      questions: activity.questions.map(toQuestionRow),
      attempt: attempt
        ? { number: attempt.number, startedAt: attempt.startedAt, lastSavedAt: attempt.lastSavedAt, answers: answers.map(toStudentAnswer) }
        : null,
      completedAttempts: attempts
        .flatMap((row) => (row.completedAt ? [{ number: row.number, completedAt: row.completedAt }] : []))
        .sort((a, b) => b.number - a.number),
      lastResult: concluded ? await this.concludedInput(concluded) : null,
    };
  }

  /**
   * One concluded attempt of the session student in an EXERCISE activity of their context, with the
   * snapshot questions (013 `GET /me/activities/:activityId/attempts/:number`); null when the activity
   * is out of context, is not an EXERCISE, or the attempt doesn't exist or isn't concluded (→ 404).
   */
  async loadConcluded(
    studentUserId: string,
    activityId: string,
    number: number,
    now: Date,
  ): Promise<{ inContext: boolean; found: { questions: ActivityQuestionRow[]; attempt: ConcludedAttemptInput } | null }> {
    const activity = await this.prisma.classActivity.findFirst({
      where: { id: activityId, ...visibleTo(studentUserId, now) },
      select: { type: true, questions: { orderBy: { position: "asc" }, select: ACTIVITY_QUESTION_SELECT } },
    });
    if (!activity) return { inContext: false, found: null };
    if (activity.type !== "EXERCISE") return { inContext: true, found: null };
    const attempt = await this.prisma.activityAttempt.findFirst({
      where: { activityId, studentUserId, number, completedAt: { not: null } },
      select: ATTEMPT_SELECT,
    });
    if (!attempt) return { inContext: true, found: null };
    return { inContext: true, found: { questions: activity.questions.map(toQuestionRow), attempt: await this.concludedInput(attempt) } };
  }

  private async concludedInput(attempt: AttemptRow): Promise<ConcludedAttemptInput> {
    const answers = await this.answersOf(attempt.id);
    return {
      number: attempt.number,
      completedAt: attempt.completedAt!,
      results: attempt.results,
      answers: answers.map((row) => ({ questionId: row.questionId, answer: answerOfRow(row) })),
    };
  }

  private answersOf(attemptId: string) {
    return this.prisma.activityAnswer.findMany({
      where: { attemptId },
      select: { questionId: true, questionType: true, text: true, alternativeId: true, source: true, revision: true },
    });
  }

  /**
   * The activity in the student's context and their latest attempt (015), or null (→ 404). With
   * `tx`, under `FOR SHARE` of the activity and of the attempt — or `FOR UPDATE` of the attempt with
   * `attemptLock: "UPDATE"`, which serializes the student's own writes (the AI help, research F11):
   * a teacher's close and the student's submit wait for the caller, and the attempt read after the
   * wait is its latest version (READ COMMITTED).
   */
  async ownAttempt(
    studentUserId: string,
    activityId: string,
    now: Date,
    tx?: Tx,
    attemptLock: "SHARE" | "UPDATE" = "SHARE",
  ): Promise<OwnAttemptContext | null> {
    const db = tx ?? this.prisma;
    const lock = tx ? Prisma.sql`FOR SHARE OF ca` : Prisma.empty;
    const activities = await db.$queryRaw<
      {
        type: OwnAttemptContext["type"];
        execution_mode: OwnAttemptContext["executionMode"];
        status: OwnAttemptContext["activityStatus"];
        deadline: Date | null;
        late_policy: LatePolicy | null;
        ai_help_allowance: number;
        class_active: boolean;
      }[]
    >`
      SELECT ca.type::text AS type, ca.execution_mode::text AS execution_mode, ca.status::text AS status, ca.deadline,
             ca.late_policy::text AS late_policy, ca.ai_help_allowance, (c.status = 'ACTIVE') AS class_active
      FROM class_activities ca
      JOIN classes c ON c.id = ca.class_id
      WHERE ca.id = ${activityId}::uuid
        AND ca.status <> 'CANCELLED'
        AND ca.publish_at <= ${now}
        AND EXISTS (SELECT 1 FROM enrollments e WHERE e.class_id = ca.class_id AND e.student_user_id = ${studentUserId}::uuid AND e.status = 'ACTIVE')
      ${lock}`;
    const activity = activities[0];
    if (!activity) return null;
    const attempts = await db.$queryRaw<{ id: string; status: "IN_PROGRESS" | "SUBMITTED"; started_at: Date; submitted_at: Date | null }[]>`
      SELECT a.id, a.status::text AS status, a.started_at, s.submitted_at
      FROM activity_attempts a
      LEFT JOIN activity_submissions s ON s.attempt_id = a.id
      WHERE a.activity_id = ${activityId}::uuid AND a.student_user_id = ${studentUserId}::uuid
      ORDER BY a.number DESC LIMIT 1
      ${tx ? (attemptLock === "UPDATE" ? Prisma.sql`FOR UPDATE OF a` : Prisma.sql`FOR SHARE OF a`) : Prisma.empty}`;
    const attempt = attempts[0];
    return {
      classActive: activity.class_active,
      type: activity.type,
      executionMode: activity.execution_mode,
      activityStatus: activity.status,
      deadline: activity.deadline,
      latePolicy: activity.late_policy,
      aiHelpAllowance: aiHelpAllowanceOf(activity.ai_help_allowance),
      attempt: attempt ? { id: attempt.id, status: attempt.status, startedAt: attempt.started_at, submittedAt: attempt.submitted_at } : null,
    };
  }

  /**
   * Why an id the student asked for is out of context, when the activity exists: an unscoped
   * lookup that only decides the audit (research P18); the answer is the same 404 either way.
   */
  async deniedReason(studentUserId: string, activityId: string, now: Date): Promise<DeniedReason | null> {
    const activity = await this.prisma.classActivity.findUnique({
      where: { id: activityId },
      select: { classId: true, status: true, publishAt: true },
    });
    if (!activity) return null;
    const enrolled = await this.prisma.enrollment.count({ where: { classId: activity.classId, studentUserId, status: "ACTIVE" } });
    if (enrolled === 0) return "NOT_ENROLLED";
    if (activity.status === "CANCELLED") return "CANCELLED";
    return activity.publishAt.getTime() > now.getTime() ? "NOT_PUBLISHED" : null;
  }

  /** The student's attempts of each activity, by number (one for an ASSIGNMENT; 1..n for an EXERCISE). */
  private async attemptsOf(studentUserId: string, activityIds: readonly string[]): Promise<Map<string, AttemptRow[]>> {
    if (activityIds.length === 0) return new Map();
    const rows = await this.prisma.activityAttempt.findMany({
      where: { studentUserId, activityId: { in: [...activityIds] } },
      select: ATTEMPT_SELECT,
      orderBy: { number: "asc" },
    });
    const byActivity = new Map<string, AttemptRow[]>();
    for (const row of rows) byActivity.set(row.activityId, [...(byActivity.get(row.activityId) ?? []), row]);
    return byActivity;
  }
}

/** Published, not cancelled activities of the classes where the student is ACTIVE (FR-007). */
const visibleTo = (studentUserId: string, now: Date) =>
  ({
    status: { not: "CANCELLED" },
    publishAt: { lte: now },
    schoolClass: { enrollments: { some: { studentUserId, status: "ACTIVE" } } },
  }) satisfies Prisma.ClassActivityWhereInput;

/** The facts of the student's situation, by type (contracts/student-status.md). */
function factsOf(activity: ActivityRow, attempts: readonly AttemptRow[], now: Date): ActivityFacts {
  const latest = attempts.at(-1) ?? null;
  const classActive = activity.schoolClass.status === "ACTIVE";
  if (activity.type === "EXERCISE") {
    return {
      type: "EXERCISE",
      activityStatus: activity.status,
      classActive,
      latestAttempt: latest && { number: latest.number, status: latest.status },
      awaitingCorrection: (attempts[0]?.results ?? []).some((row) => row.result === "PENDING_TEACHER"),
      now,
    };
  }
  const submission = latest?.submission ?? null;
  return {
    type: "ASSIGNMENT",
    activityStatus: activity.status,
    ...assignmentSchedule(activity),
    classActive,
    attempt: latest && { status: latest.status },
    submission: submission && { late: submission.late, gradingComplete: !submission.gradePartial },
    released: activity.resultReleasedAt !== null,
    now,
  };
}

function toInput(activity: ActivityRow, attempts: readonly AttemptRow[], now: Date, canSeeResults: boolean): StudentActivityInput {
  const facts = factsOf(activity, attempts, now);
  const submission = attempts[0]?.submission ?? null;
  return {
    id: activity.id,
    type: activity.type,
    executionMode: activity.executionMode,
    aiHelpAllowance: aiHelpAllowanceOf(activity.aiHelpAllowance),
    title: activity.title,
    instructions: activity.instructions,
    class: { id: activity.schoolClass.id, name: activity.schoolClass.name },
    subjectName: activity.schoolClass.subject?.name ?? null,
    teacherName: activity.teacher.name,
    publishAt: activity.publishAt,
    deadline: activity.deadline,
    latePolicy: activity.latePolicy,
    totalCents: nullableCents(activity.totalGrade),
    points:
      facts.type === "EXERCISE"
        ? {
            possible: activity.questions.reduce((sum, question) => sum + (question.points ?? 0), 0),
            earned: (attempts[0]?.results ?? []).reduce((sum, row) => sum + row.points, 0),
            awaitingCorrection: facts.awaitingCorrection,
          }
        : null,
    facts,
    canSeeResults,
    submission: submission && {
      submittedAt: submission.submittedAt,
      late: submission.late,
      acceptedByTeacher: submission.acceptedById !== null,
      blankCount: submission.blankCount,
      gradeCents: decimalToCents(submission.grade),
      generalFeedback: submission.generalFeedback,
      gradings: submission.gradings.map((grading) => ({
        questionId: grading.questionId,
        finalCents: grading.finalGrade === null ? null : decimalToCents(grading.finalGrade),
        feedback: grading.feedback,
      })),
    },
  };
}

/** A saved answer with its revision (research P8). */
const toStudentAnswer = (row: AnswerRow & { questionId: string; revision: number }): StudentAnswer => ({
  questionId: row.questionId,
  answer: answerOfRow(row),
  revision: row.revision,
});
