import { Injectable } from "@nestjs/common";
import type { Tx } from "../../platform/database/transaction";
import type { AuthContext } from "../../platform/http/request-context";

/** What a generated work's review changed: it was approved (or, later, archived). */
export interface WorkReviewChange {
  auth: AuthContext;
  workId: string;
  generationRequestId: string;
  requestId: string | null;
  now: Date;
}

export type WorkReviewListener = (
  tx: Tx,
  change: WorkReviewChange,
) => Promise<void>;

/**
 * The bank's extension point for the review of a generated work (011 research W10, like the 010
 * `ExerciseBatchReview`): the bank calls it inside the transaction of the approval, and the
 * generation module, which the bank never imports, registers the listener that closes the AI
 * proposal. Without a listener (the bank alone) it does nothing.
 */
@Injectable()
export class WorkReview {
  private readonly listeners: WorkReviewListener[] = [];

  register(listener: WorkReviewListener): void {
    this.listeners.push(listener);
  }

  async changed(tx: Tx, change: WorkReviewChange): Promise<void> {
    for (const listener of this.listeners) await listener(tx, change);
  }
}
