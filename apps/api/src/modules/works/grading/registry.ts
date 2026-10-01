import type { Answer, QuestionGrading, WorkGradingStrategy } from "@repo/contracts";
import { aiReview } from "./ai-review";
import { exactMatch } from "./exact-match";
import type { GradableQuestion, GradingPorts, GradingStrategy } from "./strategy";
import { testCases } from "./test-cases";

/** Every grading strategy by its key (011/FR-036, research W7): a new one is a new entry here. */
export const GRADING_STRATEGIES: { readonly [S in WorkGradingStrategy]: GradingStrategy<S> } = {
  EXACT_MATCH: exactMatch,
  TEST_CASES: testCases,
  AI_REVIEW: aiReview,
};

/** Grades one answer with the strategy stored on the question; nothing here looks at its kind. */
export function gradeQuestion(question: GradableQuestion, answer: Answer, ports: GradingPorts): Promise<QuestionGrading> {
  const strategy = GRADING_STRATEGIES[question.strategy] as GradingStrategy<WorkGradingStrategy>;
  return (strategy.grade as (question: GradableQuestion, answer: Answer, ports: GradingPorts) => Promise<QuestionGrading>)(question, answer, ports);
}
