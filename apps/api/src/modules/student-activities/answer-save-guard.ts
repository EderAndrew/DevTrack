import { Injectable } from "@nestjs/common";
import type { Answer } from "@repo/contracts";
import type { ActivityExecutionMode } from "../../generated/prisma/client";
import type { Tx } from "../../platform/database/transaction";

/** The attempt whose answers are being saved or submitted, locked by the caller. */
export interface GuardedAttempt {
  id: string;
  activityId: string;
  studentUserId: string;
  executionMode: ActivityExecutionMode;
  startedAt: Date;
}

/** One answer about to be written: its question and the new content. */
export interface GuardedAnswer {
  questionId: string;
  answer: Answer;
}

/** Per answer, in the order given: write it, or refuse it as grown faster than typing (015 research F7). */
export type AnswerSaveVerdict = "OK" | "TYPING_LIMIT_EXCEEDED";

export type AnswerSaveCheck = (tx: Tx, attempt: GuardedAttempt, answers: readonly GuardedAnswer[], now: Date) => Promise<AnswerSaveVerdict[]>;

/**
 * The attempt's extension point for the controlled mode (015 research F1, F7): saving and submitting
 * ask it, under the attempt's row lock, before writing the answers; `attempt-integrity`, which
 * `student-activities` never imports, registers the typing allowance at startup. Without a
 * registration every answer is OK.
 */
@Injectable()
export class AnswerSaveGuard {
  private checkFn: AnswerSaveCheck | null = null;

  register(check: AnswerSaveCheck): void {
    this.checkFn = check;
  }

  async check(tx: Tx, attempt: GuardedAttempt, answers: readonly GuardedAnswer[], now: Date): Promise<AnswerSaveVerdict[]> {
    if (!this.checkFn || answers.length === 0) return answers.map(() => "OK");
    const verdicts = await this.checkFn(tx, attempt, answers, now);
    if (verdicts.length !== answers.length) throw new Error("AnswerSaveGuard: one verdict per answer");
    return verdicts;
  }
}
