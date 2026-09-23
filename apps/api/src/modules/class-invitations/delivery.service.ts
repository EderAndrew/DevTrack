import { Inject, Injectable, Logger } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { webLinks } from "../../platform/mail/links";
import { MailDispatcher } from "../../platform/mail/mail-dispatcher";
import { Mailer } from "../../platform/mail/mailer";
import { FIRST_ATTEMPT_GRACE_MS, inFlightDeadline, MAX_DELIVERY_ATTEMPTS } from "./delivery-schedule";

/** What the `class-invitation` e-mail shows; never the token (it only goes into the link). */
export interface InvitationMail {
  email: string;
  className: string;
  classCode: string;
  period: string | null;
  teacherName: string;
  expiresAt: Date;
}

/** Invitation fields the e-mail needs (`classInvitation` select). */
export const INVITATION_MAIL_SELECT = {
  email: true,
  expiresAt: true,
  schoolClass: { select: { name: true, code: true, period: true, teacher: { select: { name: true } } } },
} as const;

export function toInvitationMail(row: {
  email: string;
  expiresAt: Date;
  schoolClass: { name: string; code: string; period: string | null; teacher: { name: string } };
}): InvitationMail {
  const { schoolClass } = row;
  return {
    email: row.email,
    className: schoolClass.name,
    classCode: schoolClass.code,
    period: schoolClass.period,
    teacherName: schoolClass.teacher.name,
    expiresAt: row.expiresAt,
  };
}

/** One claimed attempt: the delivery row already counts it and the invitation holds `token`'s hash. */
export interface DeliveryAttempt {
  deliveryId: string;
  invitationId: string;
  attempt: number;
  token: string;
  mail: InvitationMail;
}

/**
 * Class invitation e-mail delivery (D5, contracts/mail-delivery.md). A delivery row is written
 * with each creation or resend; the first attempt runs after commit with the request's token,
 * and `ClassInvitationDeliveryWorker` retries due deliveries with a fresh token. Rows, logs and
 * audit never hold the token, its hash or the link.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger("ClassInvitationDelivery");
  private readonly links: ReturnType<typeof webLinks>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly dispatcher: MailDispatcher,
  ) {
    this.links = webLinks(config.webOrigin);
  }

  /**
   * New `PENDING` delivery for the invitation, due in 1 min (the first attempt normally records
   * its result before that); earlier pending deliveries of the invitation become `SUPERSEDED`.
   */
  async schedule(tx: Tx, invitationId: string, now = new Date()): Promise<string> {
    await tx.classInvitationDelivery.updateMany({
      where: { invitationId, status: "PENDING" },
      data: { status: "SUPERSEDED", nextAttemptAt: null },
    });
    const delivery = await tx.classInvitationDelivery.create({
      data: { invitationId, status: "PENDING", attempts: 0, nextAttemptAt: new Date(now.getTime() + FIRST_ATTEMPT_GRACE_MS) },
      select: { id: true },
    });
    return delivery.id;
  }

  /**
   * First attempt, off the response path. Call only after the transaction that scheduled the
   * delivery has committed. Skipped when the worker already took the delivery over.
   */
  attemptNow(deliveryId: string, invitationId: string, token: string, mail: InvitationMail): void {
    this.dispatcher.afterCommit(async () => {
      const claimed = await this.prisma.runInTransaction(async (tx) => {
        const rows = await tx.$queryRaw<{ status: string; attempts: number }[]>`
          SELECT status, attempts FROM class_invitation_deliveries WHERE id = ${deliveryId}::uuid FOR UPDATE`;
        const row = rows[0];
        if (row?.status !== "PENDING" || row.attempts !== 0) return false;
        await tx.classInvitationDelivery.update({
          where: { id: deliveryId },
          data: { attempts: 1, nextAttemptAt: inFlightDeadline(1, new Date()) },
        });
        return true;
      });
      if (claimed) await this.deliver({ deliveryId, invitationId, attempt: 1, token, mail });
    });
  }

  /**
   * Sends a claimed attempt and records the outcome: `SENT`, or the error code (the retry time
   * was set when the attempt was claimed), or `FAILED` on the last attempt. The update only
   * applies while the delivery is still at this attempt, so a stale result never overwrites a
   * newer one.
   */
  async deliver(attempt: DeliveryAttempt): Promise<void> {
    const { deliveryId, invitationId, token, mail } = attempt;
    const current = { id: deliveryId, status: "PENDING" as const, attempts: attempt.attempt };
    try {
      await this.mailer.send({
        to: mail.email,
        template: "class-invitation",
        params: {
          className: mail.className,
          classCode: mail.classCode,
          period: mail.period,
          teacherName: mail.teacherName,
          link: this.links.classInvitation(token),
          expiresAt: mail.expiresAt,
        },
      });
    } catch (error) {
      const errorName = errorCode(error);
      const exhausted = attempt.attempt >= MAX_DELIVERY_ATTEMPTS;
      await this.prisma.classInvitationDelivery.updateMany({
        where: current,
        data: exhausted ? { status: "FAILED", nextAttemptAt: null, lastErrorCode: errorName } : { lastErrorCode: errorName },
      });
      this.logFailure(exhausted, { invitationId, deliveryId, attempt: attempt.attempt, errorName });
      return;
    }
    await this.prisma.classInvitationDelivery.updateMany({
      where: current,
      data: { status: "SENT", sentAt: new Date(), nextAttemptAt: null },
    });
  }

  logFailure(
    exhausted: boolean,
    fields: { invitationId: string; deliveryId: string; attempt: number; errorName: string },
  ): void {
    if (exhausted) this.logger.error(fields, "class_invitation.delivery_exhausted");
    else this.logger.warn(fields, "class_invitation.delivery_failed");
  }
}

/** A short identifier of the failure (e.g. `ECONNREFUSED`), never its message. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return code;
  return error instanceof Error ? error.name : "UnknownError";
}
