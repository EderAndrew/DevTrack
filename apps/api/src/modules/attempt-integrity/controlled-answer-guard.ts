import { randomUUID } from "node:crypto";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import type { Tx } from "../../platform/database/transaction";
import { AuditService } from "../audit/audit.service";
import { AnswerSaveGuard, type AnswerSaveVerdict, type GuardedAnswer, type GuardedAttempt } from "../student-activities/answer-save-guard";
import { insertIntegrityEvents } from "./integrity-events";
import { withinTypingAllowance } from "./typing-allowance";

/**
 * The typing allowance of a CONTROLLED attempt (015/FR-013c, research F7), registered on the
 * `AnswerSaveGuard` hook of `student-activities` at startup. Saving and submitting call it under the
 * attempt's row lock with the answers about to be written: an open answer or code that grows past the
 * allowance since its last save (or, for the first save, since the attempt started, from the code's
 * starter) is refused and recorded as a `TYPING_LIMIT_EXCEEDED` event of the SYSTEM; multiple choice
 * and NORMAL attempts are never checked. The browser's block can be bypassed; this is what completes it.
 */
@Injectable()
export class ControlledAnswerGuard implements OnModuleInit {
  constructor(
    private readonly hook: AnswerSaveGuard,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.hook.register((tx, attempt, answers, now) => this.check(tx, attempt, answers, now));
  }

  async check(tx: Tx, attempt: GuardedAttempt, answers: readonly GuardedAnswer[], now: Date): Promise<AnswerSaveVerdict[]> {
    const typed = answers.filter((item) => item.answer.kind !== "ALTERNATIVE").map((item) => item.questionId);
    if (attempt.executionMode !== "CONTROLLED" || typed.length === 0) return answers.map(() => "OK");

    const stored = new Map(
      (
        await tx.activityAnswer.findMany({
          where: { attemptId: attempt.id, questionId: { in: typed } },
          select: { questionId: true, text: true, source: true, savedAt: true },
        })
      ).map((row) => [row.questionId, row]),
    );
    const starters = new Map(
      (
        await tx.classActivityQuestion.findMany({ where: { activityId: attempt.activityId, id: { in: typed } }, select: { id: true, starterCode: true } })
      ).map((row) => [row.id, row.starterCode]),
    );
    const verdicts = answers.map(({ questionId, answer }): AnswerSaveVerdict => {
      if (answer.kind === "ALTERNATIVE") return "OK";
      const row = stored.get(questionId);
      const before = row ? ((answer.kind === "TEXT" ? row.text : row.source) ?? "") : answer.kind === "CODE" ? (starters.get(questionId) ?? "") : "";
      const after = answer.kind === "TEXT" ? answer.text : answer.source;
      return withinTypingAllowance({ before, after, since: row?.savedAt ?? attempt.startedAt, now }, this.config.controlledMode) ? "OK" : "TYPING_LIMIT_EXCEEDED";
    });

    const refused = answers.filter((_, index) => verdicts[index] === "TYPING_LIMIT_EXCEEDED");
    if (refused.length > 0) {
      await insertIntegrityEvents(tx, this.audit, {
        attempt,
        events: refused.map(({ questionId }) => ({
          clientEventId: randomUUID(),
          type: "TYPING_LIMIT_EXCEEDED",
          questionId,
          clientOccurredAt: null,
          buffered: false,
        })),
        now,
        actor: "SYSTEM",
        requestId: null,
      });
    }
    return verdicts;
  }
}
