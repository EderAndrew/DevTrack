import { Injectable } from "@nestjs/common";
import type { Tx } from "../../platform/database/transaction";
import type { AuthContext } from "../../platform/http/request-context";

/** What a batch's review changed: one of its drafts was approved or discarded. */
export interface BatchReviewChange {
  auth: AuthContext;
  batchId: string;
  requestId: string | null;
  now: Date;
}

export type BatchReviewListener = (tx: Tx, change: BatchReviewChange) => Promise<void>;

/**
 * The bank's extension point for batch reviews (010 research X1, X15): the bank calls it inside
 * the transaction of each approval or discard of a batch's draft, and the generation module, which
 * the bank never imports, registers the listener that closes the AI proposal. Without a listener
 * (the bank alone) it does nothing.
 */
@Injectable()
export class ExerciseBatchReview {
  private readonly listeners: BatchReviewListener[] = [];

  register(listener: BatchReviewListener): void {
    this.listeners.push(listener);
  }

  async changed(tx: Tx, change: BatchReviewChange): Promise<void> {
    for (const listener of this.listeners) await listener(tx, change);
  }
}
