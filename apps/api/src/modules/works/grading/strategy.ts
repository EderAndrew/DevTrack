import type { Answer, GradeCents, PendingReason, QuestionGrading, WorkGradingStrategy } from "@repo/contracts";

// The grading of a work's questions (011 contracts/grading.md, research W7): pure domain rules
// that 012 calls on real answers. No route, table or model call in 011 (FR-042).

/** What the Code Runner (a spec of its own) runs: never the expected solution (FR-038). */
export interface CodeRunInput {
  languageKey: string;
  /** The student's code, as data: only the Code Runner executes it, isolated (constitution IV). */
  source: string;
  testCases: { input: string; expectedOutput: string }[];
}

export type CodeRunStatus = "PASSED" | "FAILED" | "UNAVAILABLE" | "INFRA_ERROR";

export interface CodeRunnerPort {
  run(input: CodeRunInput): Promise<{ status: CodeRunStatus }>;
}

/** What 012's WorkEvaluationAgent is given to suggest a grade for an open answer. */
export interface AiReviewInput {
  statement: string;
  expectedAnswer: string;
  rubric: string | null;
  valueCents: GradeCents;
  answer: string;
}

/** A suggestion, or a failure (unavailable, invalid output, timeout): never a final grade. */
export type AiReviewOutcome =
  | { kind: "SUGGESTED"; suggestedCents: GradeCents; justification: string; feedback: string; confidence: number }
  | { kind: "FAILED" };

export interface AiReviewPort {
  review(input: AiReviewInput): Promise<AiReviewOutcome>;
}

export interface GradingPorts {
  codeRunner: CodeRunnerPort;
  aiReview: AiReviewPort;
}

/** A multiple-choice question as its strategy sees it: the correct alternative, nothing else. */
export interface ExactMatchQuestion {
  strategy: "EXACT_MATCH";
  id: string;
  valueCents: GradeCents;
  correctAlternativeId: string;
}

/**
 * A code question as its strategy sees it: the language and every test case (PUBLIC and PRIVATE).
 * There is no field for the expected solution, so a textual comparison is impossible (FR-038).
 */
export interface TestCasesQuestion {
  strategy: "TEST_CASES";
  id: string;
  valueCents: GradeCents;
  languageKey: string;
  testCases: { input: string; expectedOutput: string }[];
}

/** An open answer as its strategy sees it: what the reviewer needs to suggest a grade. */
export interface AiReviewQuestion {
  strategy: "AI_REVIEW";
  id: string;
  valueCents: GradeCents;
  statement: string;
  expectedAnswer: string;
  rubric: string | null;
}

export type GradableQuestion = ExactMatchQuestion | TestCasesQuestion | AiReviewQuestion;
export type GradableQuestionOf<S extends WorkGradingStrategy> = Extract<GradableQuestion, { strategy: S }>;

/** One strategy (FR-036): a new one is a new registry entry, never a branch on the question type. */
export interface GradingStrategy<S extends WorkGradingStrategy> {
  key: S;
  grade(question: GradableQuestionOf<S>, answer: Answer, ports: GradingPorts): Promise<QuestionGrading>;
}

/** A broken grading rule: a code, never content. */
export class GradingRuleError extends Error {
  override readonly name = "GradingRuleError";

  constructor(readonly code: "GRADE_OUT_OF_RANGE" | "ANSWER_KIND_MISMATCH") {
    super(code);
  }
}

/** The answer of the kind the strategy grades; any other is the caller's mistake, never a grade. */
export function answerOf<K extends Answer["kind"]>(answer: Answer, kind: K): Extract<Answer, { kind: K }> {
  if (answer.kind !== kind) throw new GradingRuleError("ANSWER_KIND_MISMATCH");
  return answer as Extract<Answer, { kind: K }>;
}

/** Whole hundredths in 0…`valueCents`. */
export const withinValue = (cents: number, valueCents: GradeCents) => Number.isInteger(cents) && cents >= 0 && cents <= valueCents;

const blank = (question: GradableQuestion): Omit<QuestionGrading, "status" | "nature" | "finalCents" | "pendingReason"> => ({
  questionId: question.id,
  strategy: question.strategy,
  valueCents: question.valueCents,
  suggestedCents: null,
  teacherCents: null,
});

/** A rule's result: final, `RULE_RESULT` (FR-037, FR-038). */
export const ruleResult = (question: GradableQuestion, cents: GradeCents): QuestionGrading => ({
  ...blank(question),
  status: "GRADED",
  nature: "RULE_RESULT",
  finalCents: cents,
  pendingReason: null,
});

/** The teacher grades it; a technical failure is never a 0 (FR-040). */
export const pendingTeacher = (question: GradableQuestion, reason: PendingReason): QuestionGrading => ({
  ...blank(question),
  status: "PENDING_TEACHER",
  nature: null,
  finalCents: null,
  pendingReason: reason,
});
