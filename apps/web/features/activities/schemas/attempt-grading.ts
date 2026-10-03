import { centsToGrade, type GradeSubmissionRequest, gradeToCents, type TeacherAttempt, type TeacherQuestion } from "@repo/contracts";
import type { FormError } from "@/components/shared";
import { formatGrade } from "./activity-form";

/** What the teacher types for one question: the grade ("0,25") and the feedback. */
export interface QuestionGradingValues {
  grade: string;
  feedback: string;
}

export interface AttemptGradingValues {
  questions: Record<string, QuestionGradingValues>;
  generalFeedback: string;
}

export const gradeFieldId = (position: number) => `nota-questao-${position + 1}`;
export const feedbackFieldId = (position: number) => `feedback-questao-${position + 1}`;
export const GENERAL_FEEDBACK_FIELD_ID = "feedback-geral";

const GRADE_INPUT = /^\d{1,3}([.,]\d{1,2})?$/;

/** The form as the submission stands: each final grade with a comma, empty while pending. */
export function attemptGradingDefaults(attempt: TeacherAttempt): AttemptGradingValues {
  const gradings = attempt.submission?.gradings ?? [];
  return {
    questions: Object.fromEntries(
      gradings.map((grading) => [grading.questionId, { grade: grading.finalGrade ? formatGrade(grading.finalGrade) : "", feedback: grading.feedback ?? "" }]),
    ),
    generalFeedback: attempt.submission?.generalFeedback ?? "",
  };
}

/**
 * The teacher's decisions for `PUT …/grades` (research P13), or the errors of the fields: a grade
 * with at most two decimals, from 0 to the question's value (the API checks it again). An empty
 * grade keeps the question as it is; only what changed is sent, at the submission's version.
 */
export function toGradeSubmission(
  values: AttemptGradingValues,
  attempt: TeacherAttempt,
  questions: readonly TeacherQuestion[],
): { request: GradeSubmissionRequest; errors: FormError[] } {
  const submission = attempt.submission!;
  const errors: FormError[] = [];
  const decisions: GradeSubmissionRequest["decisions"] = [];
  for (const question of questions) {
    const typed = values.questions[question.id] ?? { grade: "", feedback: "" };
    const input = typed.grade.trim();
    if (input === "") continue;
    const fieldId = gradeFieldId(question.position);
    const range = `de 0,00 a ${formatGrade(question.value)}`;
    if (!GRADE_INPUT.test(input)) {
      errors.push({ fieldId, message: `Questão ${question.position + 1}: informe uma nota ${range}, com até duas casas decimais.` });
      continue;
    }
    const cents = gradeToCents(input.replace(",", "."));
    if (cents > gradeToCents(question.value)) {
      errors.push({ fieldId, message: `Questão ${question.position + 1}: a nota deve ficar ${range}.` });
      continue;
    }
    const grading = submission.gradings.find((item) => item.questionId === question.id);
    const feedback = typed.feedback.trim() === "" ? null : typed.feedback;
    const sameGrade = grading?.finalGrade !== null && grading?.finalGrade !== undefined && gradeToCents(grading.finalGrade) === cents;
    if (sameGrade && feedback === (grading?.feedback ?? null)) continue;
    decisions.push({ questionId: question.id, grade: centsToGrade(cents), feedback });
  }
  const generalFeedback = values.generalFeedback.trim() === "" ? null : values.generalFeedback;
  return {
    request: {
      version: submission.version,
      decisions,
      ...(generalFeedback === submission.generalFeedback ? {} : { generalFeedback }),
    },
    errors,
  };
}
