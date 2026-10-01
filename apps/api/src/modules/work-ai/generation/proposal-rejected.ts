/**
 * Why an output can't become a proposal or a work (011 contracts/work-generator.md): a code such as
 * `COUNT_MISMATCH` or `TOPIC_OUT_OF_SCOPE`, never content.
 */
export class ProposalRejected extends Error {
  override readonly name = "ProposalRejected";

  constructor(readonly reason: string) {
    super(reason);
  }
}
