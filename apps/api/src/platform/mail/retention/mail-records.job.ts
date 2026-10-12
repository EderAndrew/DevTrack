import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/config.schema";
import { PrismaService } from "../../database/prisma.service";
import type { Tx } from "../../database/transaction";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../../maintenance/maintenance.service";

const DAY_MS = 86_400_000;

/** Provider notices are kept for 90 days (017 research N13). */
export const MAIL_NOTICE_RETENTION_DAYS = 90;

/**
 * Deletes the technical records of the outbox (017 research N13, contracts/maintenance-jobs.md), in
 * batches: provider notices received more than 90 days ago, then deliveries in a final state whose
 * last change is older than `MAIL_RECORDS_RETENTION_DAYS`, except the latest delivery of an invitation
 * that is still PENDING (its inviter still sees that situation). Each batch runs with
 * `SET LOCAL devtrack.mail_purge = 'on'`, the only way past the notices' append-only trigger, which
 * also lets a deleted delivery clear the `delivery_id` of its remaining notices. Only counts are
 * logged, and no audit event is written (a purge of technical records, as `ai-records`).
 */
@Injectable()
export class MailRecordsJob implements MaintenanceJob, OnModuleInit {
  readonly name = "mail-records";

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  async run({ now, batchSize }: MaintenanceJobContext): Promise<number> {
    const noticeCutoff = new Date(now.getTime() - MAIL_NOTICE_RETENTION_DAYS * DAY_MS);
    const deliveryCutoff = new Date(now.getTime() - this.config.mail.recordsRetentionDays * DAY_MS);

    const notices = await deleteInBatches(batchSize, () =>
      this.purge(
        (tx) => tx.$executeRaw`
          DELETE FROM mail_notices
          WHERE id IN (
            SELECT n.id FROM mail_notices n
            WHERE n.received_at < ${noticeCutoff}::timestamptz
            ORDER BY n.received_at, n.id
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
          )`,
      ),
    );

    const deliveries = await deleteInBatches(batchSize, () =>
      this.purge(
        (tx) => tx.$executeRaw`
          DELETE FROM mail_deliveries
          WHERE id IN (
            SELECT d.id FROM mail_deliveries d
            WHERE d.status IN ('DELIVERED', 'UNDELIVERED', 'FAILED', 'DISCARDED', 'SUPERSEDED')
              AND d.updated_at < ${deliveryCutoff}::timestamptz
              AND NOT (
                d.class_invitation_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM class_invitations ci WHERE ci.id = d.class_invitation_id AND ci.status = 'PENDING')
                AND NOT EXISTS (
                  SELECT 1 FROM mail_deliveries l
                  WHERE l.class_invitation_id = d.class_invitation_id
                    AND (l.created_at, l.id) > (d.created_at, d.id)
                )
              )
              AND NOT (
                d.invitation_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM invitations i WHERE i.id = d.invitation_id AND i.status = 'PENDING')
                AND NOT EXISTS (
                  SELECT 1 FROM mail_deliveries l
                  WHERE l.invitation_id = d.invitation_id
                    AND (l.created_at, l.id) > (d.created_at, d.id)
                )
              )
            ORDER BY d.updated_at, d.id
            LIMIT ${batchSize}
            FOR UPDATE OF d SKIP LOCKED
          )`,
      ),
    );

    return notices + deliveries;
  }

  private purge(batch: (tx: Tx) => Promise<number>): Promise<number> {
    return this.prisma.runInTransaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL devtrack.mail_purge = 'on'");
      return batch(tx);
    });
  }
}
