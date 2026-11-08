import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../../platform/maintenance/maintenance.service";

/** Alerts and their deliveries are kept 7 days (024 contracts/configuration.md, research Y12). */
export const EXAM_ALERT_RETENTION_DAYS = 7;

/**
 * Deletes the alerts created more than 7 days ago, their deliveries in cascade, in batches, each under
 * `SET LOCAL devtrack.exam_alert_purge = 'on'`, the only way past the alerts' guard trigger. A PENDING alert
 * that old was settled EXPIRED long before (60 s), so the status is not looked at. Only counts are logged
 * and no audit event is written (a purge, as `mail-records`).
 */
@Injectable()
export class ExamAlertsRetentionJob implements MaintenanceJob, OnModuleInit {
  readonly name = "exam-alerts";

  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  run({ now, batchSize }: MaintenanceJobContext): Promise<number> {
    const cutoff = new Date(now.getTime() - EXAM_ALERT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return deleteInBatches(batchSize, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL devtrack.exam_alert_purge = 'on'");
        return tx.$executeRaw`
          DELETE FROM exam_alerts
          WHERE id IN (
            SELECT a.id FROM exam_alerts a
            WHERE a.created_at < ${cutoff}::timestamptz
            ORDER BY a.created_at, a.id
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
          )`;
      }),
    );
  }
}
