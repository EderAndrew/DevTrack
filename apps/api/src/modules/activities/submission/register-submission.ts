import { type Answer, centsToGrade, type ExamEndReason } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";
import { requiredCents } from "../activity-query";
import { type GradingQuestion, gradeSubmission } from "../grading/grade-submission";
import { answerOfRow, isBlankAnswer } from "../status/answers";

export interface RegisterSubmissionInput {
  attemptId: string;
  activityId: string;
  studentUserId: string;
  /** Server clock. */
  now: Date;
  late: boolean;
  /** The teacher who accepted the saved attempt (FR-006b); then `late` is true. */
  acceptedById?: string | null;
  /**
   * 018: how an EXAM attempt ended (set iff the activity is an EXAM, trigger). Ended by the time or
   * the close, its blank questions score a rule's 0 with no teacher action (FR-014).
   */
  endReason?: ExamEndReason;
  /**
   * 018/FR-021: required with `endReason: CANCELLED` — the teacher who confirmed the cancellation and
   * when. Every question is then their decision of 0 (`HUMAN_DECISION`), never a rule's.
   */
  cancellation?: { teacherId: string; decidedAt: Date };
}

/** The ends of an exam the student didn't choose: their blanks score zero (018/FR-014, SC-008). */
const ZERO_BLANKS: ReadonlySet<ExamEndReason> = new Set(["TIME_EXPIRED", "ACTIVITY_CLOSED"]);

export interface RegisteredSubmission {
  submissionId: string;
  blankCount: number;
  questionCount: number;
  pendingTeacherCount: number;
}

/**
 * Turns an IN_PROGRESS attempt, already locked `FOR UPDATE` by the caller, into its submission in
 * the caller's transaction (FR-024, FR-027, FR-028, research P9, P12): the attempt goes SUBMITTED
 * (its answers freeze, by trigger), the submission is written with the server clock and the late
 * flag, the blank questions counted by FR-023, every question graded through the 011 registry
 * (multiple choice by `EXACT_MATCH`, the rest pending for the teacher, never a 0) and the grade
 * summed in hundredths, partial while a question has no final grade. Shared by the student's submit
 * and the teacher's acceptance; the caller decides the rules and writes the audit event.
 */
export async function registerSubmission(tx: Tx, input: RegisterSubmissionInput): Promise<RegisteredSubmission> {
  const activity = await tx.classActivity.findUniqueOrThrow({ where: { id: input.activityId }, select: { totalGrade: true } });
  const questions = await tx.classActivityQuestion.findMany({
    where: { activityId: input.activityId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      type: true,
      gradingStrategy: true,
      value: true,
      statement: true,
      expectedAnswer: true,
      rubric: true,
      starterCode: true,
      language: { select: { key: true } },
      alternatives: { where: { isCorrect: true }, select: { id: true } },
      testCases: { orderBy: { position: "asc" }, select: { input: true, expectedOutput: true } },
    },
  });
  const rows = await tx.activityAnswer.findMany({
    where: { attemptId: input.attemptId },
    select: { questionId: true, questionType: true, text: true, alternativeId: true, source: true },
  });
  const answers = new Map<string, Answer>(rows.map((row) => [row.questionId, answerOfRow(row)]));

  const blanks = questions.filter((question) => isBlankAnswer(question, answers.get(question.id) ?? null));
  const blankCount = blanks.length;
  const gradingQuestions: GradingQuestion[] = questions.map((question) => ({
    id: question.id,
    type: question.type,
    gradingStrategy: question.gradingStrategy,
    valueCents: requiredCents(question.value),
    statement: question.statement,
    expectedAnswer: question.expectedAnswer,
    rubric: question.rubric,
    languageKey: question.language?.key ?? null,
    correctAlternativeId: question.alternatives[0]?.id ?? null,
    testCases: question.testCases,
  }));
  const cancellation = input.endReason === "CANCELLED" ? input.cancellation : undefined;
  if (input.endReason === "CANCELLED" && !cancellation) throw new Error("a cancelled exam needs the teacher's decision (018/FR-021)");
  const zeroBlanks = input.endReason && ZERO_BLANKS.has(input.endReason) ? new Set(blanks.map((question) => question.id)) : undefined;
  const grading = cancellation
    ? { gradeCents: 0, partial: false, gradings: [] }
    : await gradeSubmission(gradingQuestions, answers, requiredCents(activity.totalGrade), undefined, zeroBlanks);

  await tx.activityAttempt.update({ where: { id: input.attemptId }, data: { status: "SUBMITTED" } });
  const submission = await tx.activitySubmission.create({
    data: {
      attemptId: input.attemptId,
      activityId: input.activityId,
      studentUserId: input.studentUserId,
      submittedAt: input.now,
      late: input.late,
      blankCount,
      acceptedById: input.acceptedById ?? null,
      endReason: input.endReason ?? null,
      cancelledById: cancellation?.teacherId ?? null,
      grade: centsToGrade(grading.gradeCents),
      gradePartial: grading.partial,
    },
    select: { id: true },
  });
  if (cancellation) {
    // The teacher's zero on each question (deferred trigger `activity_submissions_cancelled_valid`).
    const zero = centsToGrade(0);
    await tx.activityQuestionGrading.createMany({
      data: questions.map((question) => ({
        submissionId: submission.id,
        questionId: question.id,
        activityId: input.activityId,
        status: "DECIDED" as const,
        nature: "HUMAN_DECISION" as const,
        finalGrade: zero,
        teacherGrade: zero,
        decidedById: cancellation.teacherId,
        decidedAt: cancellation.decidedAt,
      })),
    });
    return { submissionId: submission.id, blankCount, questionCount: questions.length, pendingTeacherCount: 0 };
  }
  await tx.activityQuestionGrading.createMany({
    data: grading.gradings.map((item) => ({
      submissionId: submission.id,
      questionId: item.questionId,
      activityId: input.activityId,
      status: item.status === "GRADED" ? "GRADED" : "PENDING_TEACHER",
      nature: item.status === "GRADED" ? "RULE_RESULT" : null,
      finalGrade: item.finalCents === null ? null : centsToGrade(item.finalCents),
      pendingReason: item.status === "GRADED" ? null : item.pendingReason,
    })),
  });
  return {
    submissionId: submission.id,
    blankCount,
    questionCount: questions.length,
    pendingTeacherCount: grading.gradings.filter((item) => item.status !== "GRADED").length,
  };
}
