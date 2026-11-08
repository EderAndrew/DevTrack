import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { Tx } from "../../platform/database/transaction";
import { type ExamAlertDraft, type ExamAlertRecorder, ExamAlertSink } from "../attempt-integrity/exam-alert-sink";
import { ExamAlertWorker } from "./exam-alert.worker";

/**
 * The alert outbox (024 research Y5): registered on `attempt-integrity`'s `ExamAlertSink`, it writes one
 * `exam_alerts` row per draft in the events batch's transaction — rolled back with the occurrence, never
 * sent for an uncommitted fact — and a resent batch writes nothing (UNIQUE per attempt and ordinal). After
 * the commit it wakes the worker. Nothing about the alert touches the exam (FR-015).
 */
@Injectable()
export class ExamAlertOutbox implements ExamAlertRecorder, OnModuleInit {
  constructor(
    private readonly sink: ExamAlertSink,
    private readonly worker: ExamAlertWorker,
  ) {}

  onModuleInit(): void {
    this.sink.register(this);
  }

  async record(tx: Tx, drafts: readonly ExamAlertDraft[]): Promise<void> {
    await tx.examAlert.createMany({
      data: drafts.map((draft) => ({
        kind: draft.kind,
        activityId: draft.activityId,
        attemptId: draft.attemptId,
        studentUserId: draft.studentUserId,
        occurrenceOrdinal: draft.occurrenceOrdinal,
        holdId: draft.holdId,
        createdAt: draft.recordedAt,
      })),
      skipDuplicates: true,
    });
  }

  kick(): void {
    this.worker.kick();
  }
}
