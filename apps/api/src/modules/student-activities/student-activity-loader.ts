import { Injectable } from "@nestjs/common";
import type { ActivityStatus, ActivityType, AiHelpAllowance, ExamEndReason, ExecutionMode, LatePolicy, ReleaseMode, StudentAnswer } from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { ACTIVITY_QUESTION_SELECT, aiHelpAllowanceOf, decimalToCents, nullableCents, toQuestionRow } from "../activities/activity-query";
import { type ActivityFacts, assignmentSchedule, examTiming } from "../activities/status/facts";
import { endsAt, type ExamTiming, startDeadline } from "../activities/status/exam-time";
import { type AnswerRow, answerOfRow } from "../activities/status/answers";
import { pauseTime } from "../activities/status/pause-time";
import type { ActivityQuestionRow } from "../activities/views/rows";
import type { ConcludedAttemptInput, StudentActivityDetailInput, StudentActivityInput, StudentExamInput } from "../activities/views/student-view";

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
  /** 016: a `PRESENT_ONLY` work takes attendance and room exits (research M2). */
  releaseMode: ReleaseMode;
  attempt: { id: string; status: "IN_PROGRESS" | "SUBMITTED"; startedAt: Date; submittedAt: Date | null; endReason: ExamEndReason | null } | null;
  /** 018: an EXAM's time (research T4); null for the other types. */
  exam: ExamTiming | null;
  /**
   * 016: the attempt is PAUSED (research M6): IN_PROGRESS with a pause not released while the activity
   * is ACTIVE. Read after the attempt's lock, so a pause committed before it is seen.
   */
  paused: { pauseId: string } | null;
}

/**
 * A write refused because the student's attempt is paused (016/FR-013, research M6): thrown inside
 * the transaction; after the rollback the 015 events and help record `attempt_pause.write_refused`
 * and answer `409 ATTEMPT_PAUSED`.
 */
export class AttemptPaused extends Error {
  constructor(
    readonly attemptId: string,
    readonly pauseId: string,
  ) {
    super("ATTEMPT_PAUSED");
  }
}

/**
 * Why an existing activity is outside the student's context (`student_access.denied`, research P18):
 * since 016 also a `PRESENT_ONLY` work the student was not marked present in (research M4).
 */
export type DeniedReason = "NOT_ENROLLED" | "NOT_PUBLISHED" | "CANCELLED" | "NOT_PRESENT";

const ACTIVITY_SELECT = {
  id: true,
  type: true,
  executionMode: true,
  aiHelpAllowance: true,
  releaseMode: true,
  title: true,
  instructions: true,
  status: true,
  publishAt: true,
  deadline: true,
  latePolicy: true,
  totalGrade: true,
  resultReleasedAt: true,
  /** 016: an open pause of a submitted attempt ends at the close by derivation (research M7). */
  closedAt: true,
  /** 018: an EXAM's time (research T4): its start window, duration, inactivity limit and what caps its end. */
  startWindowMinutes: true,
  durationMinutes: true,
  inactivityLimitSeconds: true,
  cancelledAt: true,
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
      /** 018: how an EXAM attempt ended. */
      endReason: true,
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
    // 016/FR-013, FR-022: while the attempt is paused, neither the questions nor the answers leave.
    const pause =
      attempt?.status === "IN_PROGRESS" && activity.status === "ACTIVE" && activity.releaseMode === "PRESENT_ONLY"
        ? await this.prisma.attemptPause.findFirst({
            where: { attemptId: attempt.id, releasedAt: null },
            select: { id: true, initiatedBy: true, reason: true, note: true, startedAt: true },
          })
        : null;
    // 018/FR-019: nor while an exam's hold is open ("Encerrada por avisos"), on every device.
    const exam = activity.type === "EXAM" ? await this.examOf(activity, attempt) : null;
    const hidden = pause !== null || exam?.hold != null;
    const answers = attempt && !hidden ? await this.answersOf(attempt.id) : [];
    // EXERCISE: the latest concluded attempt, with its answer key (013/FR-012).
    const concluded = activity.type === "EXERCISE" ? attempts.filter((row) => row.completedAt !== null).at(-1) : undefined;
    // 016/FR-021: the own pauses, only after the submission; each end derived with the server's now.
    const submission = attempt?.submission ?? null;
    const pauses =
      attempt && submission && activity.releaseMode === "PRESENT_ONLY"
        ? await this.prisma.attemptPause.findMany({
            where: { attemptId: attempt.id },
            orderBy: [{ startedAt: "asc" }, { id: "asc" }],
            select: { id: true, initiatedBy: true, reason: true, note: true, startedAt: true, releasedAt: true },
          })
        : [];
    const pauseEnd = { acceptedAt: submission?.acceptedById ? submission.submittedAt : null, activityEndedAt: activity.closedAt };
    return {
      ...toInput(activity, attempts, now, canSeeResults),
      aiHelpUsed: attempts.reduce((sum, row) => sum + row._count.helpRequests, 0),
      questions: hidden ? [] : activity.questions.map(toQuestionRow),
      pause,
      pauses: pauses.map(({ releasedAt, ...pause }) => ({ ...pause, endedAt: pauseTime({ ...pause, releasedAt }, pauseEnd, now).endedAt })),
      attempt: attempt
        ? { number: attempt.number, startedAt: attempt.startedAt, lastSavedAt: attempt.lastSavedAt, answers: answers.map(toStudentAnswer) }
        : null,
      completedAttempts: attempts
        .flatMap((row) => (row.completedAt ? [{ number: row.number, completedAt: row.completedAt }] : []))
        .sort((a, b) => b.number - a.number),
      lastResult: concluded ? await this.concludedInput(concluded) : null,
      exam,
    };
  }

  /**
   * An EXAM's facts for its student (018 research T13): the time derived with the server's `now`
   * from the attempt's own start, the occurrence count (the last ordinal), the open hold and how the
   * attempt ended. Read after the touch's settlement, so an expired attempt already has its end.
   */
  private async examOf(
    activity: Pick<ActivityRow, "publishAt" | "durationMinutes" | "startWindowMinutes" | "inactivityLimitSeconds" | "closedAt" | "cancelledAt">,
    attempt: AttemptRow | null,
  ): Promise<StudentExamInput> {
    const timing = examTiming(activity);
    const [occurrences, hold] = attempt
      ? await Promise.all([
          this.prisma.examOccurrence.aggregate({ where: { attemptId: attempt.id }, _max: { ordinal: true } }),
          this.prisma.examAttemptHold.findFirst({ where: { attemptId: attempt.id, resolution: null }, select: { openedAt: true } }),
        ])
      : [null, null];
    if (activity.inactivityLimitSeconds === null) throw new Error("an EXAM has an inactivity limit (CHECK)");
    return {
      durationMinutes: timing.durationMinutes,
      inactivityLimitSeconds: activity.inactivityLimitSeconds,
      startDeadline: startDeadline(timing),
      endsAt: attempt ? endsAt(timing, attempt.startedAt) : null,
      occurrenceCount: occurrences?._max.ordinal ?? 0,
      hold: hold && attempt?.status === "IN_PROGRESS" ? { openedAt: hold.openedAt } : null,
      endReason: attempt?.submission?.endReason ?? null,
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
   * wait is its latest version (READ COMMITTED). `"UPDATE_IF_EXAM"` takes `FOR UPDATE` only for an
   * EXAM's attempt, whose events batches count occurrences one at a time (018 research T6).
   */
  async ownAttempt(
    studentUserId: string,
    activityId: string,
    now: Date,
    tx?: Tx,
    attemptLock: "SHARE" | "UPDATE" | "UPDATE_IF_EXAM" = "SHARE",
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
        release_mode: ReleaseMode;
        publish_at: Date;
        duration_minutes: number | null;
        start_window_minutes: number | null;
        closed_at: Date | null;
        cancelled_at: Date | null;
      }[]
    >`
      SELECT ca.type::text AS type, ca.execution_mode::text AS execution_mode, ca.status::text AS status, ca.deadline,
             ca.late_policy::text AS late_policy, ca.ai_help_allowance, (c.status = 'ACTIVE') AS class_active,
             ca.release_mode::text AS release_mode, ca.publish_at, ca.duration_minutes, ca.start_window_minutes, ca.closed_at, ca.cancelled_at
      FROM class_activities ca
      JOIN classes c ON c.id = ca.class_id
      WHERE ca.id = ${activityId}::uuid
        AND ca.status <> 'CANCELLED'
        AND ca.publish_at <= ${now}
        AND EXISTS (SELECT 1 FROM enrollments e WHERE e.class_id = ca.class_id AND e.student_user_id = ${studentUserId}::uuid AND e.status = 'ACTIVE')
        AND ${releasedToSql(studentUserId)}
      ${lock}`;
    const activity = activities[0];
    if (!activity) return null;
    const exclusive = attemptLock === "UPDATE" || (attemptLock === "UPDATE_IF_EXAM" && activity.type === "EXAM");
    const attempts = await db.$queryRaw<
      { id: string; status: "IN_PROGRESS" | "SUBMITTED"; started_at: Date; submitted_at: Date | null; end_reason: ExamEndReason | null }[]
    >`
      SELECT a.id, a.status::text AS status, a.started_at, s.submitted_at, s.end_reason::text AS end_reason
      FROM activity_attempts a
      LEFT JOIN activity_submissions s ON s.attempt_id = a.id
      WHERE a.activity_id = ${activityId}::uuid AND a.student_user_id = ${studentUserId}::uuid
      ORDER BY a.number DESC LIMIT 1
      ${tx ? (exclusive ? Prisma.sql`FOR UPDATE OF a` : Prisma.sql`FOR SHARE OF a`) : Prisma.empty}`;
    const attempt = attempts[0];
    // A separate statement after the attempt's lock: it sees a pause committed while this one waited.
    const pauses =
      attempt?.status === "IN_PROGRESS" && activity.status === "ACTIVE" && activity.release_mode === "PRESENT_ONLY"
        ? await db.$queryRaw<{ id: string }[]>`
            SELECT id FROM attempt_pauses WHERE attempt_id = ${attempt.id}::uuid AND released_at IS NULL`
        : [];
    return {
      classActive: activity.class_active,
      type: activity.type,
      executionMode: activity.execution_mode,
      activityStatus: activity.status,
      deadline: activity.deadline,
      latePolicy: activity.late_policy,
      aiHelpAllowance: aiHelpAllowanceOf(activity.ai_help_allowance),
      releaseMode: activity.release_mode,
      attempt: attempt
        ? { id: attempt.id, status: attempt.status, startedAt: attempt.started_at, submittedAt: attempt.submitted_at, endReason: attempt.end_reason }
        : null,
      paused: pauses[0] ? { pauseId: pauses[0].id } : null,
      exam:
        activity.type === "EXAM"
          ? examTiming({
              publishAt: activity.publish_at,
              durationMinutes: activity.duration_minutes,
              startWindowMinutes: activity.start_window_minutes,
              closedAt: activity.closed_at,
              cancelledAt: activity.cancelled_at,
            })
          : null,
    };
  }

  /**
   * Why an id the student asked for is out of context, when the activity exists: an unscoped
   * lookup that only decides the audit (research P18); the answer is the same 404 either way.
   */
  async deniedReason(studentUserId: string, activityId: string, now: Date): Promise<DeniedReason | null> {
    const activity = await this.prisma.classActivity.findUnique({
      where: { id: activityId },
      select: { classId: true, status: true, publishAt: true, releaseMode: true },
    });
    if (!activity) return null;
    const enrolled = await this.prisma.enrollment.count({ where: { classId: activity.classId, studentUserId, status: "ACTIVE" } });
    if (enrolled === 0) return "NOT_ENROLLED";
    if (activity.status === "CANCELLED") return "CANCELLED";
    if (activity.publishAt.getTime() > now.getTime()) return "NOT_PUBLISHED";
    if (activity.releaseMode === "PRESENT_ONLY") {
      const present = await this.prisma.activityAttendance.count({ where: { activityId, studentUserId } });
      if (present === 0) return "NOT_PRESENT";
    }
    return null;
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

/**
 * Published, not cancelled activities of the classes where the student is ACTIVE (FR-007), and since
 * 016 released to them: every enrollment, or the student marked present (016/FR-008, research M4).
 */
const visibleTo = (studentUserId: string, now: Date) =>
  ({
    status: { not: "CANCELLED" },
    publishAt: { lte: now },
    schoolClass: { enrollments: { some: { studentUserId, status: "ACTIVE" } } },
    OR: [{ releaseMode: "ALL_ENROLLED" }, { attendances: { some: { studentUserId } } }],
  }) satisfies Prisma.ClassActivityWhereInput;

/**
 * The same release clause for the raw queries over `class_activities ca` (016 research M4): here and
 * in the attempts' `lockContext`, so start, save, submit, the 015 events and help see what the list sees.
 */
export const releasedToSql = (studentUserId: string) =>
  Prisma.sql`(ca.release_mode = 'ALL_ENROLLED'
    OR EXISTS (SELECT 1 FROM activity_attendances aa WHERE aa.activity_id = ca.id AND aa.student_user_id = ${studentUserId}::uuid))`;

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
  if (activity.type === "EXAM") {
    if (activity.startWindowMinutes === null) throw new Error("an EXAM has a start window (CHECK)");
    return {
      type: "EXAM",
      activityStatus: activity.status,
      startDeadline: startDeadline({ publishAt: activity.publishAt, startWindowMinutes: activity.startWindowMinutes }),
      classActive,
      attempt: latest && { status: latest.status },
      submission: submission && { endReason: submission.endReason, gradingComplete: !submission.gradePartial },
      released: activity.resultReleasedAt !== null,
      now,
    };
  }
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
