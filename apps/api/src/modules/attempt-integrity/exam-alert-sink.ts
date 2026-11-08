import { Injectable } from "@nestjs/common";
import type { ExamAlertKind } from "../../generated/prisma/client";
import type { Tx } from "../../platform/database/transaction";

/**
 * One alert the events batch asks for (024 research Y5, contracts/push-notifications.md): a counted
 * occurrence that does not open a hold (`OCCURRENCE`), or the occurrence that opens it (`HOLD`, with the
 * hold). Ids, the ordinal and the server time only; who receives it is resolved at send time.
 */
export interface ExamAlertDraft {
  kind: ExamAlertKind;
  activityId: string;
  attemptId: string;
  studentUserId: string;
  occurrenceOrdinal: number;
  holdId: string | null;
  recordedAt: Date;
}

/** Writes the drafts in the batch's transaction; wakes the sender after the commit. */
export interface ExamAlertRecorder {
  record(tx: Tx, drafts: readonly ExamAlertDraft[]): Promise<void>;
  kick(): void;
}

/**
 * The exam attempt's extension point for alerts (024 research Y5, like 015's `AnswerSaveGuard`):
 * `FocusEventsService` hands it the occurrences and the hold it counted, inside the batch's transaction,
 * and kicks it after the commit; `exam-alerts`, which `attempt-integrity` never imports, registers the
 * outbox at startup. Without a registration nothing is written and the exam behaves exactly as in 018
 * (024/FR-015).
 */
@Injectable()
export class ExamAlertSink {
  private recorder: ExamAlertRecorder | null = null;

  register(recorder: ExamAlertRecorder): void {
    this.recorder = recorder;
  }

  async record(tx: Tx, drafts: readonly ExamAlertDraft[]): Promise<void> {
    if (!this.recorder || drafts.length === 0) return;
    await this.recorder.record(tx, drafts);
  }

  kick(): void {
    this.recorder?.kick();
  }
}

/**
 * The drafts of a batch (contracts/push-notifications.md, "When an alert is written"): one `OCCURRENCE`
 * per new occurrence, except the one that opens the hold, which becomes the `HOLD` alert. Pure.
 */
export function alertDrafts(
  attempt: { attemptId: string; activityId: string; studentUserId: string },
  occurrences: readonly { ordinal: number; recordedAt: Date }[],
  hold: { id: string; ordinal: number } | null,
): ExamAlertDraft[] {
  return occurrences.map((occurrence) => {
    const opensHold = hold !== null && occurrence.ordinal === hold.ordinal;
    return {
      kind: opensHold ? "HOLD" : "OCCURRENCE",
      ...attempt,
      occurrenceOrdinal: occurrence.ordinal,
      holdId: opensHold ? hold.id : null,
      recordedAt: occurrence.recordedAt,
    };
  });
}
