import type { Answer, GradeCents, QuestionGrading, WorkGradingStrategy, WorkQuestionType } from "@repo/contracts";
import { gradeQuestion } from "../../works/grading/registry";
import { type GradableQuestion, type GradingPorts, ruleResult } from "../../works/grading/strategy";
import { UnavailableCodeRunner } from "../../works/grading/unavailable-code-runner";
import { computeWorkGrade } from "../../works/grading/work-grade";
import { UnavailableAiReview } from "./unavailable-ai-review";

/** A question of the snapshot as grading needs it (the answer key stays on the server). */
export interface GradingQuestion {
  id: string;
  type: WorkQuestionType;
  gradingStrategy: WorkGradingStrategy;
  valueCents: GradeCents;
  statement: string;
  expectedAnswer: string | null;
  rubric: string | null;
  /** CODE: the language's catalog key. */
  languageKey: string | null;
  correctAlternativeId: string | null;
  testCases: { input: string; expectedOutput: string }[];
}

/** 012 runs no AI and no code (research P12, constitution IV): both ports are unavailable. */
export const NO_AUTOMATION_PORTS: GradingPorts = { codeRunner: new UnavailableCodeRunner(), aiReview: new UnavailableAiReview() };

/** What a question with no saved answer is graded as: a blank of its own kind. */
export function blankAnswer(type: WorkQuestionType): Answer {
  if (type === "MULTIPLE_CHOICE") return { kind: "ALTERNATIVE", alternativeId: null };
  if (type === "CODE") return { kind: "CODE", source: "" };
  return { kind: "TEXT", text: "" };
}

function gradable(question: GradingQuestion): GradableQuestion {
  const base = { id: question.id, valueCents: question.valueCents };
  if (question.gradingStrategy === "EXACT_MATCH") {
    return { ...base, strategy: "EXACT_MATCH", correctAlternativeId: question.correctAlternativeId ?? "" };
  }
  if (question.gradingStrategy === "TEST_CASES") {
    return { ...base, strategy: "TEST_CASES", languageKey: question.languageKey ?? "", testCases: question.testCases };
  }
  return { ...base, strategy: "AI_REVIEW", statement: question.statement, expectedAnswer: question.expectedAnswer ?? "", rubric: question.rubric };
}

export interface SubmissionGrading {
  gradings: QuestionGrading[];
  gradeCents: GradeCents;
  partial: boolean;
}

/**
 * Grades a submission at the moment it is registered (FR-027, FR-028): every question through the
 * 011 registry with the strategy stored on it — multiple choice by `EXACT_MATCH` (a blank is 0), open
 * answers and code pending for the teacher, never a 0 — and the grade by `computeWorkGrade`, partial
 * while a question has no final grade. `zeroBlanks` (018/FR-014: an exam ended by the time or the
 * close) grades the questions left blank as a rule's 0, with no teacher action.
 */
export async function gradeSubmission(
  questions: readonly GradingQuestion[],
  answers: ReadonlyMap<string, Answer>,
  totalCents: GradeCents,
  ports: GradingPorts = NO_AUTOMATION_PORTS,
  zeroBlanks: ReadonlySet<string> = new Set(),
): Promise<SubmissionGrading> {
  const gradings: QuestionGrading[] = [];
  for (const question of questions) {
    gradings.push(
      zeroBlanks.has(question.id)
        ? ruleResult(gradable(question), 0)
        : await gradeQuestion(gradable(question), answers.get(question.id) ?? blankAnswer(question.type), ports),
    );
  }
  const grade = computeWorkGrade(gradings, totalCents);
  return { gradings, gradeCents: grade.cents, partial: grade.partial };
}
