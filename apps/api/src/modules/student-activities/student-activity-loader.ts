import { Injectable } from "@nestjs/common";
import type { StudentAnswer } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import { ACTIVITY_QUESTION_SELECT, decimalToCents, toQuestionRow } from "../activities/activity-query";
import { type AnswerRow, answerOfRow } from "../activities/status/answers";
import type { StudentActivityDetailInput, StudentActivityInput } from "../activities/views/student-view";

/** Why an existing activity is outside the student's context (`student_access.denied`, research P18). */
export type DeniedReason = "NOT_ENROLLED" | "NOT_PUBLISHED" | "CANCELLED";

const ACTIVITY_SELECT = {
  id: true,
  type: true,
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
} as const satisfies Prisma.ClassActivitySelect;

const ATTEMPT_SELECT = {
  id: true,
  activityId: true,
  status: true,
  startedAt: true,
  lastSavedAt: true,
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
    return activities.map((activity) => toInput(activity, attempts.get(activity.id) ?? null, now, canSeeResults));
  }

  /** One activity in the student's context with its questions and saved answers, or null (→ 404). */
  async loadOne(studentUserId: string, activityId: string, now: Date, canSeeResults: boolean): Promise<StudentActivityDetailInput | null> {
    const activity = await this.prisma.classActivity.findFirst({
      where: { id: activityId, ...visibleTo(studentUserId, now) },
      select: { ...ACTIVITY_SELECT, questions: { orderBy: { position: "asc" }, select: ACTIVITY_QUESTION_SELECT } },
    });
    if (!activity) return null;
    const attempt = (await this.attemptsOf(studentUserId, [activity.id])).get(activity.id) ?? null;
    const answers = attempt
      ? await this.prisma.activityAnswer.findMany({
          where: { attemptId: attempt.id },
          select: { questionId: true, questionType: true, text: true, alternativeId: true, source: true, revision: true },
        })
      : [];
    return {
      ...toInput(activity, attempt, now, canSeeResults),
      questions: activity.questions.map(toQuestionRow),
      attempt: attempt
        ? { startedAt: attempt.startedAt, lastSavedAt: attempt.lastSavedAt, answers: answers.map(toStudentAnswer) }
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
      select: { classId: true, status: true, publishAt: true },
    });
    if (!activity) return null;
    const enrolled = await this.prisma.enrollment.count({ where: { classId: activity.classId, studentUserId, status: "ACTIVE" } });
    if (enrolled === 0) return "NOT_ENROLLED";
    if (activity.status === "CANCELLED") return "CANCELLED";
    return activity.publishAt.getTime() > now.getTime() ? "NOT_PUBLISHED" : null;
  }

  private async attemptsOf(studentUserId: string, activityIds: readonly string[]): Promise<Map<string, AttemptRow>> {
    if (activityIds.length === 0) return new Map();
    const rows = await this.prisma.activityAttempt.findMany({
      where: { studentUserId, activityId: { in: [...activityIds] } },
      select: ATTEMPT_SELECT,
    });
    return new Map(rows.map((row) => [row.activityId, row]));
  }
}

/** Published, not cancelled activities of the classes where the student is ACTIVE (FR-007). */
const visibleTo = (studentUserId: string, now: Date) =>
  ({
    status: { not: "CANCELLED" },
    publishAt: { lte: now },
    schoolClass: { enrollments: { some: { studentUserId, status: "ACTIVE" } } },
  }) satisfies Prisma.ClassActivityWhereInput;

function toInput(activity: ActivityRow, attempt: AttemptRow | null, now: Date, canSeeResults: boolean): StudentActivityInput {
  const submission = attempt?.submission ?? null;
  return {
    id: activity.id,
    type: activity.type,
    title: activity.title,
    instructions: activity.instructions,
    class: { id: activity.schoolClass.id, name: activity.schoolClass.name },
    subjectName: activity.schoolClass.subject?.name ?? null,
    teacherName: activity.teacher.name,
    publishAt: activity.publishAt,
    deadline: activity.deadline,
    latePolicy: activity.latePolicy,
    totalCents: decimalToCents(activity.totalGrade),
    facts: {
      activityStatus: activity.status,
      deadline: activity.deadline,
      latePolicy: activity.latePolicy,
      classActive: activity.schoolClass.status === "ACTIVE",
      attempt: attempt && { status: attempt.status },
      submission: submission && { late: submission.late, gradingComplete: !submission.gradePartial },
      released: activity.resultReleasedAt !== null,
      now,
    },
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
