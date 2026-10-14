import type { AiReviewInput, AiReviewOutcome, AiReviewPort, CodeRunInput, CodeRunnerPort, CodeGradingStatus, GradingPorts } from "../../../src/modules/works/grading/strategy";

/**
 * Fake ports for the grading tests (contracts/grading.md): each records what it received and
 * answers what it was told. The real ones are the Code Runner spec's and 012's WorkEvaluationAgent.
 */
export class FakeCodeRunner implements CodeRunnerPort {
  readonly calls: CodeRunInput[] = [];

  constructor(private readonly answer: (input: CodeRunInput) => CodeGradingStatus) {}

  run(input: CodeRunInput): Promise<{ status: CodeGradingStatus }> {
    this.calls.push(input);
    return Promise.resolve({ status: this.answer(input) });
  }
}

export class FakeAiReview implements AiReviewPort {
  readonly calls: AiReviewInput[] = [];

  constructor(private readonly outcome: AiReviewOutcome) {}

  review(input: AiReviewInput): Promise<AiReviewOutcome> {
    this.calls.push(input);
    return Promise.resolve(this.outcome);
  }
}

/** Ports that fail the test when called: a strategy that must not use one gets these. */
export const NO_PORTS: GradingPorts = {
  codeRunner: {
    run: () => {
      throw new Error("the Code Runner must not be called");
    },
  },
  aiReview: {
    review: () => {
      throw new Error("the AI review must not be called");
    },
  },
};
