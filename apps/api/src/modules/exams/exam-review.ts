import { Injectable } from "@nestjs/common";
import type { Tx } from "../../platform/database/transaction";
import type { AuthContext } from "../../platform/http/request-context";

/** What a generated exam's review changed: it was approved, or archived before any approval. */
export interface ExamReviewChange {
  auth: AuthContext;
  examId: string;
  generationRequestId: string;
  requestId: string | null;
  now: Date;
}

export type ExamReviewListener = (tx: Tx, change: ExamReviewChange) => Promise<void>;

/**
 * The bank's extension point for the review of a generated exam (018 research T14, as the 011
 * `WorkReview`): the bank calls it inside the transaction of the approval or the archive, and
 * `exam-ai`, which the bank never imports, registers the listener that closes the AI proposal.
 * Without a listener (the bank alone) it does nothing.
 */
@Injectable()
export class ExamReview {
  private readonly listeners: ExamReviewListener[] = [];

  register(listener: ExamReviewListener): void {
    this.listeners.push(listener);
  }

  async changed(tx: Tx, change: ExamReviewChange): Promise<void> {
    for (const listener of this.listeners) await listener(tx, change);
  }
}
