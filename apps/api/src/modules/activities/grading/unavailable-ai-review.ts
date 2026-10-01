import type { AiReviewOutcome, AiReviewPort } from "../../works/grading/strategy";

/**
 * 012 grades open answers by the teacher only (research P12; the WorkEvaluationAgent has a spec of
 * its own): the AI review is unavailable, so every open answer goes pending with
 * `AI_REVIEW_UNAVAILABLE`, never a 0. Nothing here calls a model.
 */
export class UnavailableAiReview implements AiReviewPort {
  review(): Promise<AiReviewOutcome> {
    return Promise.resolve({ kind: "UNAVAILABLE" });
  }
}
