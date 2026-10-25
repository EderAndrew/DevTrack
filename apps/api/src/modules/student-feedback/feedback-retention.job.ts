import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../../platform/maintenance/maintenance.service";

/** Closed feedbacks are kept for 24 months after their last status change (020/FR-015). */
export const FEEDBACK_RETENTION_MONTHS = 24;

/**
 * Deletes the closed feedbacks (020/FR-015, research J8, contracts/maintenance-jobs.md): `RESOLVED` or
 * `ARCHIVED` with `status_changed_at` older than 24 months, in batches, each under
 * `SET LOCAL devtrack.feedback_purge = 'on'`, the only way past the feedbacks' delete guard and the
 * history's append-only trigger; the history goes in cascade. `RECEIVED` and `IN_REVIEW` are never
 * touched. Only counts are logged, and no audit event is written (a purge, as `mail-records`).
 */
@Injectable()
export class FeedbackRetentionJob implements MaintenanceJob, OnModuleInit {
  readonly name = "student-feedback";

  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  run({ now, batchSize }: MaintenanceJobContext): Promise<number> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - FEEDBACK_RETENTION_MONTHS);
    return deleteInBatches(batchSize, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL devtrack.feedback_purge = 'on'");
        return tx.$executeRaw`
          DELETE FROM student_feedbacks
          WHERE id IN (
            SELECT f.id FROM student_feedbacks f
            WHERE f.status IN ('RESOLVED', 'ARCHIVED')
              AND f.status_changed_at < ${cutoff}::timestamptz
            ORDER BY f.status_changed_at, f.id
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
          )`;
      }),
    );
  }
}
