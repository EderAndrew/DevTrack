import {
  centsToGrade,
  type ActivityType,
  type GradeCents,
  type LatePolicy,
  type StudentActivity,
  type StudentActivitySummary,
  type StudentAnswer,
  type StudentQuestion,
} from "@repo/contracts";
import type { ActivityFacts } from "../status/facts";
import { canAnswer } from "../status/operations";
import { deriveStudentStatus, isResultVisible, isUrgent } from "../status/student-status";
import type { ActivityQuestionRow } from "./rows";

// The only builders of what a student receives (research P15, 012/FR-030, FR-032): each one copies
// an allowlist from the snapshot — never removes fields from the teacher's view. A new field reaches
// students only when it is listed here. No answer key, explanation, trick flag, grading strategy,
// private test case or pending reason, and no grade or feedback before the release.

/** One question as the student may see it: 011/FR-033 applied to the snapshot. */
export function toStudentQuestion(row: ActivityQuestionRow): StudentQuestion {
  return {
    id: row.id,
    position: row.position,
    type: row.type,
    value: centsToGrade(row.valueCents),
    statement: row.statement,
    instructions: row.instructions,
    starterCode: row.starterCode,
    language: row.language ? { name: row.language.name } : null,
    publicTestCases: [...row.testCases]
      .filter((testCase) => testCase.visibility === "PUBLIC")
      .sort((a, b) => a.position - b.position)
      .map((testCase) => ({ input: testCase.input, expectedOutput: testCase.expectedOutput })),
    alternatives: [...row.alternatives].sort((a, b) => a.position - b.position).map((alternative) => ({ id: alternative.id, text: alternative.text })),
  };
}

/** What the views need of an activity seen by one student. */
export interface StudentActivityInput {
  id: string;
  type: ActivityType;
  title: string;
  instructions: string | null;
  class: { id: string; name: string };
  subjectName: string | null;
  teacherName: string;
  publishAt: Date;
  deadline: Date;
  latePolicy: LatePolicy;
  totalCents: GradeCents;
  facts: ActivityFacts;
  /** The session holds `notas.proprias.visualizar`. */
  canSeeResults: boolean;
  submission: {
    submittedAt: Date;
    late: boolean;
    acceptedByTeacher: boolean;
    blankCount: number;
    gradeCents: GradeCents;
    generalFeedback: string | null;
    gradings: { questionId: string; finalCents: GradeCents | null; feedback: string | null }[];
  } | null;
}

export interface StudentActivityDetailInput extends StudentActivityInput {
  questions: ActivityQuestionRow[];
  attempt: { startedAt: Date; lastSavedAt: Date | null; answers: StudentAnswer[] } | null;
}

const SUMMARY_LENGTH = 160;

/** The first 160 characters of the instructions, whitespace collapsed (plain text; the web escapes it). */
export function summaryOf(instructions: string | null): string {
  const text = (instructions ?? "").replace(/\s+/g, " ").trim();
  return text.length <= SUMMARY_LENGTH ? text : `${text.slice(0, SUMMARY_LENGTH - 1).trimEnd()}…`;
}

const resultVisible = (input: StudentActivityInput) => input.canSeeResults && isResultVisible(input.facts);

export function toStudentSummary(input: StudentActivityInput): StudentActivitySummary {
  const visible = resultVisible(input);
  return {
    id: input.id,
    type: input.type,
    title: input.title,
    summary: summaryOf(input.instructions),
    class: { id: input.class.id, name: input.class.name },
    subjectName: input.subjectName,
    teacherName: input.teacherName,
    publishedAt: input.publishAt.toISOString(),
    deadline: input.deadline.toISOString(),
    latePolicy: input.latePolicy,
    status: deriveStudentStatus(input.facts),
    late: input.submission?.late ?? false,
    canAnswer: canAnswer(input.facts),
    urgent: isUrgent(input.facts),
    submittedAt: input.submission?.submittedAt.toISOString() ?? null,
    totalGrade: centsToGrade(input.totalCents),
    result:
      visible && input.submission
        ? {
            grade: centsToGrade(input.submission.gradeCents),
            hasFeedback: input.submission.generalFeedback !== null || input.submission.gradings.some((grading) => grading.feedback !== null),
          }
        : null,
  };
}

export function toStudentActivity(input: StudentActivityDetailInput): StudentActivity {
  const { result: _summaryResult, ...summary } = toStudentSummary(input);
  const visible = resultVisible(input);
  return {
    ...summary,
    instructions: input.instructions,
    serverNow: input.facts.now.toISOString(),
    questions: [...input.questions].sort((a, b) => a.position - b.position).map(toStudentQuestion),
    attempt: input.attempt
      ? {
          startedAt: input.attempt.startedAt.toISOString(),
          lastSavedAt: input.attempt.lastSavedAt?.toISOString() ?? null,
          answers: input.attempt.answers.map((answer) => ({ questionId: answer.questionId, answer: answer.answer, revision: answer.revision })),
        }
      : null,
    submission: input.submission
      ? {
          submittedAt: input.submission.submittedAt.toISOString(),
          late: input.submission.late,
          acceptedByTeacher: input.submission.acceptedByTeacher,
          blankCount: input.submission.blankCount,
        }
      : null,
    result:
      visible && input.submission
        ? {
            grade: centsToGrade(input.submission.gradeCents),
            generalFeedback: input.submission.generalFeedback,
            questions: input.submission.gradings.map((grading) => ({
              questionId: grading.questionId,
              grade: centsToGrade(grading.finalCents ?? 0),
              feedback: grading.feedback,
            })),
          }
        : null,
  };
}
