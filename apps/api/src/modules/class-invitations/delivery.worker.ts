import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import { inFlightDeadline, MAX_DELIVERY_ATTEMPTS } from "./delivery-schedule";
import { type DeliveryAttempt, DeliveryService, INVITATION_MAIL_SELECT, toInvitationMail } from "./delivery.service";

const BATCH_SIZE = 50;

/**
 * Retries class invitation e-mails (D5, contracts/mail-delivery.md, step 3). Every
 * `MAIL_RETRY_INTERVAL_SECONDS` (0 disables the timer; tests call `runOnce`), up to 50 due
 * `PENDING` deliveries are locked with `FOR UPDATE SKIP LOCKED`, so several instances never
 * take the same one. A delivery whose invitation is no longer effectively `PENDING`, or that
 * is not the invitation's latest, becomes `SUPERSEDED` without sending. Otherwise the
 * invitation gets a fresh token (the previous link stops working), the attempt is counted and
 * committed, and only then is the e-mail sent. Retries never change `expires_at`,
 * `send_count` or `last_sent_at` (FR-015).
 */
@Injectable()
export class ClassInvitationDeliveryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("ClassInvitationDelivery");
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly deliveries: DeliveryService,
  ) {}

  /** One cycle at `now`; returns how many e-mails it tried to send. */
  async runOnce(now = new Date()): Promise<number> {
    const attempts = await this.prisma.runInTransaction(async (tx) => {
      const due = await tx.$queryRaw<{ id: string; invitation_id: string; attempts: number }[]>`
        SELECT id, invitation_id, attempts FROM class_invitation_deliveries
        WHERE status = 'PENDING' AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at, id
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED`;

      const claimed: DeliveryAttempt[] = [];
      for (const delivery of due) {
        const invitation = await tx.classInvitation.findUniqueOrThrow({
          where: { id: delivery.invitation_id },
          select: {
            ...INVITATION_MAIL_SELECT,
            status: true,
            deliveries: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true } },
          },
        });
        const current =
          invitation.status === "PENDING" && invitation.expiresAt > now && invitation.deliveries[0]?.id === delivery.id;
        if (!current) {
          await tx.classInvitationDelivery.update({
            where: { id: delivery.id },
            data: { status: "SUPERSEDED", nextAttemptAt: null },
          });
          continue;
        }
        if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) {
          // The last attempt was lost (e.g. the API restarted mid-send): it counts as a failure.
          await tx.classInvitationDelivery.update({
            where: { id: delivery.id },
            data: { status: "FAILED", nextAttemptAt: null },
          });
          this.deliveries.logFailure(true, {
            invitationId: delivery.invitation_id,
            deliveryId: delivery.id,
            attempt: delivery.attempts,
            errorName: "AttemptLost",
          });
          continue;
        }

        const attempt = delivery.attempts + 1;
        const token = generateToken();
        await tx.classInvitation.update({ where: { id: delivery.invitation_id }, data: { tokenHash: hashToken(token) } });
        await tx.classInvitationDelivery.update({
          where: { id: delivery.id },
          data: { attempts: attempt, nextAttemptAt: inFlightDeadline(attempt, now) },
        });
        claimed.push({
          deliveryId: delivery.id,
          invitationId: delivery.invitation_id,
          attempt,
          token,
          mail: toInvitationMail(invitation),
        });
      }
      return claimed;
    });

    for (const attempt of attempts) await this.deliveries.deliver(attempt);
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
      this.logger.error({ errorName: error instanceof Error ? error.name : "unknown" }, "class_invitation.delivery_run_failed");
    } finally {
      this.running = false;
    }
  }
}
