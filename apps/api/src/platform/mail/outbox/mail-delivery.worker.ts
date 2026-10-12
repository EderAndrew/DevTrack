import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import type { MailKind } from "../../../generated/prisma/client";
import { CLOCK, type Clock } from "../../clock/clock";
import { APP_CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/config.schema";
import { PrismaService } from "../../database/prisma.service";
import { inFlightDeadline, MAX_DELIVERY_ATTEMPTS } from "./delivery-schedule";
import { type ClaimedAttempt, MailOutbox, SUBJECT_COLUMN } from "./mail-outbox";
import { MailSubjectRegistry } from "./mail-subject";
import { MailSendBudget } from "./send-budget";

const BATCH_SIZE = 50;

interface DueRow {
  id: string;
  kind: MailKind;
  class_invitation_id: string | null;
  invitation_id: string | null;
  user_id: string | null;
  admin_bootstrap_id: string | null;
  attempts: number;
  created_at: Date;
}

/**
 * Retries the e-mails of every kind (017 contracts/mail-delivery.md, step 3; replaces the 003
 * `ClassInvitationDeliveryWorker`). Every `MAIL_RETRY_INTERVAL_SECONDS` (0 disables the timer;
 * tests call `runOnce`), up to 50 due `PENDING` deliveries are locked with `FOR UPDATE SKIP LOCKED`,
 * so several instances never take the same one, and each send takes one unit of
 * `MAIL_SENDS_PER_MINUTE` (none left, or `0`: the rest waits, nothing is lost). Per row, in the
 * claiming transaction: a lost 7th attempt → `FAILED`; a newer delivery of the subject →
 * `SUPERSEDED`; otherwise the kind's `MailSubject.prepare` discards it (`DISCARDED`) or mints a
 * fresh token, and the attempt is counted with its Message-ID. Only after the commit is the e-mail
 * sent (research N3).
 */
@Injectable()
export class MailDeliveryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("MailDeliveryWorker");
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly prisma: PrismaService,
    private readonly outbox: MailOutbox,
    private readonly subjects: MailSubjectRegistry,
    private readonly budget: MailSendBudget,
  ) {}

  /** One cycle at `now`; returns how many e-mails it tried to send. */
  async runOnce(now: Date = this.clock.now()): Promise<number> {
    if (this.config.mail.sendsPerMinute <= 0) return 0;
    const attempts = await this.prisma.runInTransaction(async (tx) => {
      const due = await tx.$queryRaw<DueRow[]>`
        SELECT id, kind, class_invitation_id, invitation_id, user_id, admin_bootstrap_id, attempts, created_at
        FROM mail_deliveries
        WHERE status = 'PENDING' AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at, created_at, id
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED`;

      const claimed: ClaimedAttempt[] = [];
      for (const row of due) {
        const delivery = {
          id: row.id,
          kind: row.kind,
          classInvitationId: row.class_invitation_id,
          invitationId: row.invitation_id,
          userId: row.user_id,
          adminBootstrapId: row.admin_bootstrap_id,
          attempts: row.attempts,
          createdAt: row.created_at,
        };
        if (row.attempts >= MAX_DELIVERY_ATTEMPTS) {
          // The last attempt was lost (e.g. the API restarted mid-send): it counts as a failure.
          await this.outbox.exhaust(tx, delivery, "AttemptLost");
          continue;
        }
        const column = SUBJECT_COLUMN[row.kind];
        const newest = await tx.mailDelivery.findFirst({
          where: { kind: row.kind, [column]: delivery[column] },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });
        if (newest?.id !== row.id) {
          await tx.mailDelivery.update({ where: { id: row.id }, data: { status: "SUPERSEDED", nextAttemptAt: null } });
          continue;
        }
        // Only a send takes budget; with none left, this row and the ones after it wait.
        if (!(await this.budget.take(now, tx))) break;
        const prepared = await this.subjects.get(row.kind).prepare(tx, delivery, now);
        if ("discard" in prepared) {
          await this.outbox.discard(tx, delivery, prepared.discard);
          continue;
        }
        const attempt = row.attempts + 1;
        const messageId = this.outbox.messageIdOf(row.id, attempt);
        await tx.mailDelivery.update({
          where: { id: row.id },
          data: { attempts: attempt, nextAttemptAt: inFlightDeadline(attempt, now), messageId },
        });
        claimed.push({ deliveryId: row.id, kind: row.kind, attempt, messageId, mail: prepared.mail });
      }
      return claimed;
    });

    let authFailed = false;
    for (const attempt of attempts) {
      const { errorCode } = await this.outbox.deliver(attempt);
      if (errorCode === "EAUTH") authFailed = true;
    }
    // A refused key fails every send the same way: one error per cycle, not one per e-mail (N8).
    if (authFailed) this.outbox.logAuthFailed();
    return attempts.length;
  }

  onApplicationBootstrap(): void {
    const seconds = this.config.mailRetryIntervalSeconds;
    if (seconds <= 0) return;
    this.timer = setInterval(() => void this.runScheduled(), seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runScheduled(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error({ errorName: error instanceof Error ? error.name : "unknown" }, "mail.delivery_run_failed");
    } finally {
      this.running = false;
    }
  }
}
