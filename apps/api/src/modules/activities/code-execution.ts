import type { ExecutionKey, TestCaseVisibility, WorkQuestionType } from "@repo/contracts";

/** What the rule reads of a snapshot question: its type, its language's profile key and its cases' visibility. */
export interface CodeExecutionQuestion {
  type: WorkQuestionType;
  language: { execution: ExecutionKey | null } | null;
  testCases: readonly { visibility: TestCaseVisibility }[];
}

/** A CODE question the 019 Code Runner can run: a language with `execution` and at least one PUBLIC case. */
export const isRunnableCodeQuestion = (question: CodeExecutionQuestion): boolean =>
  question.type === "CODE" &&
  question.language?.execution != null &&
  question.testCases.some((testCase) => testCase.visibility === "PUBLIC");

/**
 * 021/FR-001 (research Y2): a work may allow running code only when its snapshot has a runnable CODE
 * question. Derived from the snapshot and the catalog on every apply and edit, never stored; nothing is
 * executed here.
 */
export const codeExecutionEligible = (questions: readonly CodeExecutionQuestion[]): boolean => questions.some(isRunnableCodeQuestion);
