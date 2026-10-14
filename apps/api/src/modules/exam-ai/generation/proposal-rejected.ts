/**
 * Why an output can't become a proposal or an exam (018 contracts/exam-generator.md "Validation"): a
 * code such as `COUNT_MISMATCH` or `TOPIC_OUT_OF_SCOPE`, never content. It reaches the runner's log
 * and the `exam_generation.rejected` audit as that code.
 */
export class ProposalRejected extends Error {
  override readonly name = "ProposalRejected";

  constructor(readonly reason: string) {
    super(reason);
  }
}
