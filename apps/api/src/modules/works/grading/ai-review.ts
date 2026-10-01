import { answerOf, type GradingStrategy, pendingTeacher, withinValue } from "./strategy";

/**
 * `AI_REVIEW` (011/FR-039): 012's WorkEvaluationAgent suggests a grade; it stays a suggestion,
 * with no final grade, until the teacher decides (`decideByTeacher`, SC-011). A failure or a
 * suggestion outside 0…value sends the question to the teacher (FR-040), and so does the absence
 * of a reviewer (012 grades open answers by the teacher only, research P12).
 */
export const aiReview: GradingStrategy<"AI_REVIEW"> = {
  key: "AI_REVIEW",
  grade: async (question, answer, { aiReview: reviewer }) => {
    const { text } = answerOf(answer, "TEXT");
    const outcome = await reviewer.review({
      statement: question.statement,
      expectedAnswer: question.expectedAnswer,
      rubric: question.rubric,
      valueCents: question.valueCents,
      answer: text,
    });
    if (outcome.kind === "UNAVAILABLE") return pendingTeacher(question, "AI_REVIEW_UNAVAILABLE");
    if (outcome.kind === "FAILED") return pendingTeacher(question, "AI_REVIEW_FAILED");
    if (!withinValue(outcome.suggestedCents, question.valueCents)) return pendingTeacher(question, "AI_REVIEW_OUT_OF_RANGE");
    return {
      questionId: question.id,
      strategy: question.strategy,
      valueCents: question.valueCents,
      status: "SUGGESTED",
      nature: "SUGGESTION",
      suggestedCents: outcome.suggestedCents,
      teacherCents: null,
      finalCents: null,
      pendingReason: null,
    };
  },
};
