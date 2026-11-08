import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import type { ExamAlertKind, ExamAlertStatus } from "../../generated/prisma/client";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import { PUSH_RECEIPTS_BATCH, PUSH_SEND_BATCH, PushClient, type PushMessage } from "../../platform/push/push-client";
import { PushRequestRefused } from "../../platform/push/expo-push.client";
import { AuditService } from "../audit/audit.service";
import { alertMessage } from "./message";
import { type AlertDevice, AlertRecipients } from "./recipients";

/** A claim lasts this long: a worker that dies mid-send leaves the alert to the next one (research Y5). */
const LEASE_MS = 30_000;
const CLAIM_BATCH = 50;
/** Waits before the 2nd and 3rd try of a transient failure (contracts/push-notifications.md, step 5). */
const RETRY_DELAYS_MS = [2_000, 5_000];
const MAX_TRIES = 3;
/** Receipts are read every minute, for tickets 15 min to 24 h old (Expo's guidance, research Y6). */
const RECEIPTS_EVERY_MS = 60_000;
const RECEIPT_MIN_AGE_MS = 15 * 60_000;
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60_000;
const DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

interface ClaimedAlert {
  id: string;
  kind: ExamAlertKind;
  activityId: string;
  studentUserId: string;
  occurrenceOrdinal: number;
  tries: number;
  createdAt: Date;
}

/**
 * Sends the alert outbox (024 research Y5, Y6, contracts/push-notifications.md "Dispatch"): claims up to 50
 * PENDING alerts (`FOR UPDATE SKIP LOCKED`, a 30 s lease), expires the ones older than
 * `EXAM_ALERT_MAX_AGE_SECONDS` (never sent late, FR-019), resolves the recipients now and sends each device
 * at most once (one `exam_alert_deliveries` row per alert and device, written before the request). A
 * transient failure retries after 2 s and 5 s while the alert is young; a device Expo no longer knows is
 * removed. Nothing here touches the exam (FR-015). `PUSH_ENABLED=false` ends every alert SKIPPED;
 * `EXAM_ALERT_INTERVAL_MS=0` turns the timer and `kick()` off (tests call `runOnce`).
 */
@Injectable()
export class ExamAlertWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("ExamAlertWorker");
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private lastReceiptsAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushClient,
    private readonly recipients: AlertRecipients,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    const interval = this.config.push.alertIntervalMs;
    if (interval <= 0) return;
    this.timer = setInterval(() => void this.runScheduled(), interval);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** After an events batch committed alerts: send now instead of at the next tick. */
  kick(): void {
    if (this.config.push.alertIntervalMs <= 0) return;
    setImmediate(() => void this.runScheduled());
  }

  private async runScheduled(): Promise<void> {
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error({ errorName: error instanceof Error ? error.name : "unknown" }, "exam_alert.run_failed");
    }
  }

  /** One pass: the due alerts, then the receipts once a minute. Concurrent calls share the pass in progress. */
  runOnce(now: Date = this.clock.now()): Promise<void> {
    this.running ??= this.pass(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async pass(now: Date): Promise<void> {
    for (const alert of await this.claim(now)) {
      try {
        await this.dispatch(alert, now);
      } catch (error) {
        // Left PENDING under its lease; the next pass tries again while the alert is young.
        this.logger.error({ alertId: alert.id, errorName: error instanceof Error ? error.name : "unknown" }, "exam_alert.dispatch_failed");
      }
    }
    if (now.getTime() - this.lastReceiptsAt >= RECEIPTS_EVERY_MS) {
      this.lastReceiptsAt = now.getTime();
      await this.checkReceipts(now);
    }
  }

  private async claim(now: Date): Promise<ClaimedAlert[]> {
    const lease = new Date(now.getTime() + LEASE_MS);
    const claimed = await this.prisma.$queryRaw<ClaimedAlert[]>`
      UPDATE exam_alerts SET claimed_until = ${lease}
      WHERE id IN (
        SELECT id FROM exam_alerts
        WHERE status = 'PENDING' AND (claimed_until IS NULL OR claimed_until <= ${now})
        ORDER BY created_at, id
        LIMIT ${CLAIM_BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, kind, activity_id AS "activityId", student_user_id AS "studentUserId",
                occurrence_ordinal AS "occurrenceOrdinal", tries, created_at AS "createdAt"`;
    // RETURNING has no order: send in the order the occurrences happened.
    return claimed.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.occurrenceOrdinal - b.occurrenceOrdinal);
  }

  private async dispatch(alert: ClaimedAlert, now: Date): Promise<void> {
    if (now.getTime() - alert.createdAt.getTime() > this.config.push.alertMaxAgeSeconds * 1000) return this.settle(alert.id, "EXPIRED", now);
    if (!this.config.push.enabled) return this.settle(alert.id, "SKIPPED", now);

    const context = await this.recipients.context(alert.activityId, alert.studentUserId);
    const devices = context ? await this.recipients.devices(context.classId, alert.activityId, now) : [];
    if (!context || devices.length === 0) return this.settle(alert.id, "SKIPPED", now);

    // Each device at most once: the row is written before the request, and a device with a row is skipped.
    const delivered = new Set(
      (await this.prisma.examAlertDelivery.findMany({ where: { alertId: alert.id }, select: { deviceId: true } })).map((row) => row.deviceId),
    );
    const pending = devices.filter((device) => !delivered.has(device.id));
    const message = alertMessage({ ...context, kind: alert.kind, occurrenceOrdinal: alert.occurrenceOrdinal, activityId: alert.activityId, studentUserId: alert.studentUserId });

    let transient = false;
    for (let start = 0; start < pending.length; start += PUSH_SEND_BATCH) {
      const chunk = pending.slice(start, start + PUSH_SEND_BATCH);
      if (!(await this.sendChunk(alert.id, chunk, message, now))) transient = true;
    }

    const reached = (await this.prisma.examAlertDelivery.count({ where: { alertId: alert.id, status: "TICKET_OK" } })) > 0;
    if (!transient) return this.settle(alert.id, reached ? "SENT" : "SKIPPED", now);
    const tries = alert.tries + 1;
    if (tries >= MAX_TRIES) return this.settle(alert.id, reached ? "SENT" : "EXPIRED", now, tries);
    await this.prisma.examAlert.updateMany({
      where: { id: alert.id, status: "PENDING" },
      data: { tries, claimedUntil: new Date(now.getTime() + RETRY_DELAYS_MS[tries - 1]!) },
    });
  }

  /** Sends one batch; false when the whole request failed transiently (its devices are tried again later). */
  private async sendChunk(alertId: string, devices: readonly AlertDevice[], message: ReturnType<typeof alertMessage>, now: Date): Promise<boolean> {
    await this.prisma.examAlertDelivery.createMany({
      data: devices.map((device) => ({ alertId, deviceId: device.id, status: "SENDING" as const, sentAt: now })),
      skipDuplicates: true,
    });
    const messages: PushMessage[] = devices.map((device) => ({ ...message, to: device.pushToken, data: { ...message.data } }));
    let tickets;
    try {
      tickets = await this.push.send(messages);
    } catch (error) {
      if (error instanceof PushRequestRefused) {
        await this.prisma.examAlertDelivery.updateMany({
          where: { alertId, deviceId: { in: devices.map((device) => device.id) } },
          data: { status: "TICKET_ERROR", errorCode: "RequestRefused" },
        });
        return true;
      }
      // Never sent: the rows go, so the retry sends these devices again.
      await this.prisma.examAlertDelivery.deleteMany({ where: { alertId, deviceId: { in: devices.map((device) => device.id) }, status: "SENDING" } });
      this.logger.warn({ alertId, errorName: error instanceof Error ? error.name : "unknown" }, "exam_alert.send_failed");
      return false;
    }
    for (const [index, device] of devices.entries()) {
      const ticket = tickets[index]!;
      await this.prisma.examAlertDelivery.update({
        where: { alertId_deviceId: { alertId, deviceId: device.id } },
        data: ticket.ok ? { status: "TICKET_OK", ticketId: ticket.ticketId } : { status: "TICKET_ERROR", errorCode: ticket.errorCode },
      });
      if (!ticket.ok && ticket.errorCode === DEVICE_NOT_REGISTERED) await this.removeDevice(device.id);
    }
    return true;
  }

  private async settle(alertId: string, status: Exclude<ExamAlertStatus, "PENDING">, now: Date, tries?: number): Promise<void> {
    await this.prisma.examAlert.updateMany({
      where: { id: alertId, status: "PENDING" },
      data: { status, processedAt: now, claimedUntil: null, ...(tries === undefined ? {} : { tries }) },
    });
  }

  /** Expo's receipts of the tickets 15 min to 24 h old; a `DeviceNotRegistered` removes the device. */
  async checkReceipts(now: Date = this.clock.now()): Promise<void> {
    const due = await this.prisma.examAlertDelivery.findMany({
      where: {
        status: "TICKET_OK",
        receiptCheckedAt: null,
        ticketId: { not: null },
        sentAt: { lte: new Date(now.getTime() - RECEIPT_MIN_AGE_MS), gte: new Date(now.getTime() - RECEIPT_MAX_AGE_MS) },
      },
      select: { alertId: true, deviceId: true, ticketId: true },
      take: PUSH_RECEIPTS_BATCH * 10,
    });
    for (let start = 0; start < due.length; start += PUSH_RECEIPTS_BATCH) {
      const chunk = due.slice(start, start + PUSH_RECEIPTS_BATCH);
      let receipts;
      try {
        receipts = await this.push.getReceipts(chunk.map((row) => row.ticketId!));
      } catch (error) {
        this.logger.warn({ errorName: error instanceof Error ? error.name : "unknown" }, "exam_alert.receipts_failed");
        return;
      }
      for (const row of chunk) {
        const receipt = receipts.get(row.ticketId!);
        if (!receipt) continue;
        await this.prisma.examAlertDelivery.update({
          where: { alertId_deviceId: { alertId: row.alertId, deviceId: row.deviceId } },
          data: receipt.ok ? { status: "RECEIPT_OK", receiptCheckedAt: now } : { status: "RECEIPT_ERROR", errorCode: receipt.errorCode, receiptCheckedAt: now },
        });
        if (!receipt.ok && receipt.errorCode === DEVICE_NOT_REGISTERED) await this.removeDevice(row.deviceId);
      }
    }
  }

  /** Expo says the token is gone (app uninstalled, token rotated): the device is removed, audited by SYSTEM. */
  private async removeDevice(deviceId: string): Promise<void> {
    await this.prisma.runInTransaction(async (tx) => {
      const { count } = await tx.mobileDevice.deleteMany({ where: { id: deviceId } });
      if (count === 0) return;
      await this.audit.record(tx, {
        type: "mobile_device.removed",
        actorType: "SYSTEM",
        actorUserId: null,
        targetType: "MOBILE_DEVICE",
        targetId: deviceId,
        requestId: null,
        metadata: { reason: "PROVIDER_UNREGISTERED" },
      });
    });
  }
}
