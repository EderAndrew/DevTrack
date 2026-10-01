import { answerOf, type GradingStrategy, ruleResult } from "./strategy";

/**
 * `EXACT_MATCH` (011/FR-037): the chosen alternative compared on the server with the correct one —
 * its value when they match, 0 for another one or a blank. No port, no AI.
 */
export const exactMatch: GradingStrategy<"EXACT_MATCH"> = {
  key: "EXACT_MATCH",
  // Async like every strategy: a wrong answer kind rejects instead of throwing.
  grade: async (question, answer) => {
    const { alternativeId } = answerOf(answer, "ALTERNATIVE");
    return ruleResult(question, alternativeId === question.correctAlternativeId ? question.valueCents : 0);
  },
};
