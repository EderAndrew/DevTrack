/**
 * Why an output can't settle its help request (015 research F11): a code such as `REQUEST_MISMATCH`,
 * never content. The runner rolls the transaction back and the execution ends FAILED; the next read
 * reconciles the request to FAILED.
 */
export class ProposalRejected extends Error {
  override readonly name = "ProposalRejected";

  constructor(readonly reason: string) {
    super(reason);
  }
}
