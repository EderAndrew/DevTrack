import { Inject, Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import type { MailDelivery, MailKind } from "../../../generated/prisma/client";
// The audit trail is cross-cutting (global module); the only domain-side import of platform/mail.
import { AuditService } from "../../../modules/audit/audit.service";
import { CLOCK, type Clock } from "../../clock/clock";
import { APP_CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/config.schema";
import { PrismaService } from "../../database/prisma.service";
import type { Tx } from "../../database/transaction";
import { Mailer, MailSendError } from "../mailer";
import { FIRST_ATTEMPT_GRACE_MS, inFlightDeadline, MAX_DELIVERY_ATTEMPTS } from "./delivery-schedule";
import { deriveDeliveryState, type DeliverySituation, type DeliveryStateRow } from "./delivery-state";
import type { PreparedMail } from "./mail-subject";
import { MailSendBudget } from "./send-budget";

/** The column of `mail_deliveries` that holds each kind's subject (017 data-model CHECK). */
export const SUBJECT_COLUMN = {
  CLASS_INVITATION: "classInvitationId",
  INVITATION_TEACHER: "invitationId",
  INVITATION_MANAGER: "invitationId",
  VERIFY_EMAIL: "userId",
  PASSWORD_RESET: "userId",
  ADMIN_ACTIVATION: "adminBootstrapId",
} as const satisfies Record<MailKind, keyof MailDelivery>;

/** One attempt already claimed: the row counts it and carries its Message-ID. */
export interface ClaimedAttempt {
  deliveryId: string;
  kind: MailKind;
  attempt: number;
  messageId: string;
  mail: PreparedMail;
}

/** How an attempt ended: sent, refused for good, worth another try, given up, or overtaken. */
export type AttemptOutcome = "SENT" | "REJECTED" | "RETRY" | "FAILED" | "STALE";

export interface AttemptResult {
  outcome: AttemptOutcome;
  /** The failure's code (`EAUTH`, `ECONNECTION`…), null when sent. */
  errorCode: string | null;
}

/** A short identifier of a failure (e.g. `ECONNREFUSED`), never its message. */
export function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(code)) return code;
  return error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name) ? error.name : "UnknownError";
}

/**
 * The one outbox of the six e-mails (017 contracts/mail-delivery.md, research N2–N5, N8).
 *
 * - `schedule` writes the delivery in the transaction of the operation that asks for the e-mail
 *   (rolled back with it, FR-001) and retires the pending ones of the same kind and subject.
 * - `attemptNow` makes the first attempt after the commit, off the response path (FR-002), with
 *   the token the request minted; without budget it leaves the row to `MailDeliveryWorker`.
 * - `deliver` sends one claimed attempt with its own Message-ID and records the result only while
 *   the row is still `PENDING` at that attempt, so a stale result, or one a provider notice already
 *   overtook, never wins.
 *
 * Rows, logs and audit never hold the address, a name, the link, the token or the Message-ID.
 */
@Injectable()
export class MailOutbox implements OnApplicationShutdown {
  private readonly logger = new Logger("MailOutbox");
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly budget: MailSendBudget,
    private readonly audit: AuditService,
  ) {}

  /**
   * A new `PENDING` delivery of `kind` for `subjectId`, due in 1 min (the first attempt normally
   * records its result before that); the pending deliveries of the same kind and subject become
   * `SUPERSEDED`, so only the newest link goes out (US1-5). An attempt of a superseded delivery
   * already in flight may still leave, with a link the new request already killed; its result is
   * then not recorded (the row stays `SUPERSEDED`).
   */
  async schedule(tx: Tx, kind: MailKind, subjectId: string, now: Date = this.clock.now()): Promise<string> {
    const subject = { [SUBJECT_COLUMN[kind]]: subjectId } as Record<(typeof SUBJECT_COLUMN)[MailKind], string>;
    await this.supersedePending(tx, kind, subjectId);
    const delivery = await tx.mailDelivery.create({
      data: { kind, ...subject, status: "PENDING", attempts: 0, nextAttemptAt: new Date(now.getTime() + FIRST_ATTEMPT_GRACE_MS) },
      select: { id: true },
    });
    return delivery.id;
  }

  /** Retires the pending deliveries of the subject (a resend, a cancellation): they will never be sent again. */
  async supersedePending(tx: Tx, kind: MailKind, subjectId: string): Promise<void> {
    await tx.mailDelivery.updateMany({
      where: { kind, [SUBJECT_COLUMN[kind]]: subjectId, status: "PENDING" },
      data: { status: "SUPERSEDED", nextAttemptAt: null },
    });
  }

  /**
   * First attempt, off the response path. Call only after the transaction that scheduled the
   * delivery has committed. Skipped when there is no send budget this minute or the worker already
   * took the delivery over.
   */
  attemptNow(deliveryId: string, mail: PreparedMail): void {
    this.afterCommit(async () => {
      const claimed = await this.claimFirst(deliveryId, mail, this.clock.now());
      if (!claimed) return;
      const { errorCode } = await this.deliver(claimed);
      if (errorCode === "EAUTH") this.logAuthFailed();
    });
  }

  /**
   * The first attempt in the caller's flow (the admin bootstrap CLI, research N3): claimed, sent
   * and recorded before it returns. `NO_BUDGET` and `TAKEN` leave the row as it was.
   */
  async attemptSync(deliveryId: string, mail: PreparedMail): Promise<AttemptOutcome | "NO_BUDGET" | "TAKEN"> {
    const now = this.clock.now();
    if (!(await this.budget.take(now))) return "NO_BUDGET";
    const claimed = await this.claimFirst(deliveryId, mail, now, false);
    if (!claimed) return "TAKEN";
    const { outcome, errorCode } = await this.deliver(claimed);
    if (errorCode === "EAUTH") this.logAuthFailed();
    return outcome;
  }

  /** `<{deliveryId}.{attempt}@{MAIL_MESSAGE_ID_DOMAIN}>` (research N5). */
  messageIdOf(deliveryId: string, attempt: number): string {
    return `<${deliveryId}.${attempt}@${this.config.mail.messageIdDomain}>`;
  }

  /**
   * Sends a claimed attempt and records the outcome (contracts/mail-delivery.md, step 4): `SENT`;
   * a permanent refusal → `UNDELIVERED (REJECTED)`, audited; a temporary failure keeps the retry
   * time set when the attempt was claimed, or → `FAILED` on the 7th, audited. The caller logs
   * `mail.auth_failed` once for its run when the code is `EAUTH` (research N8).
   */
  async deliver(attempt: ClaimedAttempt): Promise<AttemptResult> {
    const current = { id: attempt.deliveryId, status: "PENDING" as const, attempts: attempt.attempt };
    try {
      await this.mailer.send({ ...attempt.mail, messageId: attempt.messageId } as Parameters<Mailer["send"]>[0]);
    } catch (error) {
      const errorCode = errorCodeOf(error);
      return { outcome: await this.recordFailure(attempt, error, errorCode), errorCode };
    }
    const now = this.clock.now();
    const { count } = await this.prisma.mailDelivery.updateMany({
      where: current,
      data: { status: "SENT", sentAt: now, nextAttemptAt: null },
    });
    return { outcome: count === 0 ? "STALE" : "SENT", errorCode: null };
  }

  /** Marks a pending delivery `DISCARDED` (the link it would carry is dead), audited (FR-006). */
  async discard(tx: Tx, delivery: { id: string; kind: MailKind }, reason: NonNullable<MailDelivery["discardReason"]>): Promise<void> {
    await tx.mailDelivery.update({
      where: { id: delivery.id },
      data: { status: "DISCARDED", discardReason: reason, nextAttemptAt: null },
    });
    await this.audit.record(tx, {
      type: "mail_delivery.discarded",
      actorType: "SYSTEM",
      targetType: "MAIL_DELIVERY",
      targetId: delivery.id,
      metadata: { kind: delivery.kind, reason },
    });
  }

  /**
   * Discards a delivery still `PENDING` (the admin bootstrap CLI with `--print-link`: a retry would
   * rotate the printed link); false when it already moved on.
   */
  async discardIfPending(deliveryId: string, reason: NonNullable<MailDelivery["discardReason"]>): Promise<boolean> {
    return this.prisma.runInTransaction(async (tx) => {
      const rows = await tx.$queryRaw<{ kind: MailKind }[]>`
        SELECT kind FROM mail_deliveries WHERE id = ${deliveryId}::uuid AND status = 'PENDING' FOR UPDATE`;
      if (!rows[0]) return false;
      await this.discard(tx, { id: deliveryId, kind: rows[0].kind }, reason);
      return true;
    });
  }

  /** Marks a delivery whose last attempt was lost `FAILED` (the worker found it past the 7th), audited. */
  async exhaust(tx: Tx, delivery: { id: string; kind: MailKind; attempts: number }, errorCode: string): Promise<void> {
    await tx.mailDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", nextAttemptAt: null, lastErrorCode: errorCode },
    });
    await this.auditFailed(tx, delivery, errorCode);
    this.logFailure(true, { kind: delivery.kind, deliveryId: delivery.id, attempt: delivery.attempts, errorName: errorCode });
  }

  /**
   * The situation of the e-mail of each subject (017 data-model "Derived"), for the invitation
   * lists: one query for the whole page, newest delivery first per subject.
   */
  async latestDeliveryState(kinds: readonly MailKind[], subjectIds: readonly string[], db: Pick<Tx, "mailDelivery"> = this.prisma): Promise<Map<string, DeliverySituation>> {
    const column = SUBJECT_COLUMN[kinds[0]!];
    if (kinds.some((kind) => SUBJECT_COLUMN[kind] !== column)) throw new Error("latestDeliveryState: kinds of different subjects");
    const rows = subjectIds.length
      ? await db.mailDelivery.findMany({
          where: { kind: { in: [...kinds] }, [column]: { in: [...subjectIds] } },
          select: { classInvitationId: true, invitationId: true, userId: true, adminBootstrapId: true, status: true, undeliveredReason: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : [];
    const bySubject = new Map<string, DeliveryStateRow[]>();
    for (const row of rows) {
      const subjectId = row[column]!;
      bySubject.set(subjectId, [...(bySubject.get(subjectId) ?? []), row]);
    }
    return new Map(subjectIds.map((id) => [id, deriveDeliveryState(bySubject.get(id) ?? [])]));
  }

  /** Waits for queued first attempts (tests and graceful shutdown). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  logFailure(exhausted: boolean, fields: { kind: MailKind; deliveryId: string; attempt: number; errorName: string }): void {
    if (exhausted) this.logger.error(fields, "mail.delivery_exhausted");
    else this.logger.warn(fields, "mail.delivery_failed");
  }

  logAuthFailed(): void {
    this.logger.error({ errorName: "EAUTH" }, "mail.auth_failed");
  }

  /** Runs `fn` after the current request's transaction has committed, never on the response path. */
  private afterCommit(fn: () => Promise<void>): void {
    const task = new Promise<void>((resolve) => setImmediate(resolve))
      .then(fn)
      .catch((error: unknown) => {
        this.logger.warn({ errorName: errorCodeOf(error) }, "mail.attempt_crashed");
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  /**
   * Claims attempt 1 of a delivery the request just scheduled: one budget unit (unless already
   * taken), the row still `PENDING` with no attempt (`FOR UPDATE`), then `attempts = 1`, its
   * Message-ID and the in-flight deadline (research N3, N5).
   */
  private async claimFirst(deliveryId: string, mail: PreparedMail, now: Date, takeBudget = true): Promise<ClaimedAttempt | null> {
    if (takeBudget && !(await this.budget.take(now))) return null;
    const messageId = this.messageIdOf(deliveryId, 1);
    return this.prisma.runInTransaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: string; attempts: number; kind: MailKind }[]>`
        SELECT status, attempts, kind FROM mail_deliveries WHERE id = ${deliveryId}::uuid FOR UPDATE`;
      const row = rows[0];
      if (row?.status !== "PENDING" || row.attempts !== 0) return null;
      await tx.mailDelivery.update({
        where: { id: deliveryId },
        data: { attempts: 1, nextAttemptAt: inFlightDeadline(1, now), messageId },
      });
      return { deliveryId, kind: row.kind, attempt: 1, messageId, mail };
    });
  }

  private async recordFailure(attempt: ClaimedAttempt, error: unknown, errorCode: string): Promise<AttemptOutcome> {
    const { deliveryId, kind } = attempt;
    const current = { id: deliveryId, status: "PENDING" as const, attempts: attempt.attempt };
    const now = this.clock.now();

    if (error instanceof MailSendError && error.permanent) {
      const recorded = await this.prisma.runInTransaction(async (tx) => {
        const { count } = await tx.mailDelivery.updateMany({
          where: current,
          data: { status: "UNDELIVERED", undeliveredAt: now, undeliveredReason: "REJECTED", nextAttemptAt: null, lastErrorCode: errorCode },
        });
        if (count === 0) return false;
        await this.audit.record(tx, {
          type: "mail_delivery.undelivered",
          actorType: "SYSTEM",
          targetType: "MAIL_DELIVERY",
          targetId: deliveryId,
          metadata: { kind, reason: "REJECTED", source: "SMTP" },
        });
        return true;
      });
      if (recorded) this.logger.warn({ kind, deliveryId, attempt: attempt.attempt, errorName: errorCode }, "mail.delivery_rejected");
      return recorded ? "REJECTED" : "STALE";
    }

    const exhausted = attempt.attempt >= MAX_DELIVERY_ATTEMPTS;
    const recorded = await this.prisma.runInTransaction(async (tx) => {
      const { count } = await tx.mailDelivery.updateMany({
        where: current,
        data: exhausted ? { status: "FAILED", nextAttemptAt: null, lastErrorCode: errorCode } : { lastErrorCode: errorCode },
      });
      if (count === 0) return false;
      if (exhausted) await this.auditFailed(tx, { id: deliveryId, kind, attempts: attempt.attempt }, errorCode);
      return true;
    });
    if (!recorded) return "STALE";
    this.logFailure(exhausted, { kind, deliveryId, attempt: attempt.attempt, errorName: errorCode });
    return exhausted ? "FAILED" : "RETRY";
  }

  private auditFailed(tx: Tx, delivery: { id: string; kind: MailKind; attempts: number }, errorCode: string): Promise<void> {
    return this.audit.record(tx, {
      type: "mail_delivery.failed",
      actorType: "SYSTEM",
      targetType: "MAIL_DELIVERY",
      targetId: delivery.id,
      metadata: { kind: delivery.kind, attempts: delivery.attempts, errorCode },
    });
  }
}
