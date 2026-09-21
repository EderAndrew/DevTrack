import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../../platform/maintenance/maintenance.service";
import { AuditService } from "../audit/audit.service";

/** FR-076 (Marco Civil art. 15): access records are kept for 6 months. */
export const ACCESS_RECORD_RETENTION_MONTHS = 6;

export function accessRecordsCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - ACCESS_RECORD_RETENTION_MONTHS);
  return cutoff;
}

/** Purges `access_records` older than 6 months (FR-076, R23); each batch records `access_records.purged`. */
@Injectable()
export class AccessRecordsJob implements MaintenanceJob, OnModuleInit {
  readonly name = "access-records";

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  run({ now, batchSize }: MaintenanceJobContext): Promise<number> {
    const cutoff = accessRecordsCutoff(now);
    return deleteInBatches(batchSize, () =>
      this.prisma.runInTransaction(async (tx) => {
        const removed = await tx.$executeRaw`
          DELETE FROM access_records
          WHERE id IN (
            SELECT id FROM access_records
            WHERE occurred_at < ${cutoff}::timestamptz
            ORDER BY id
            LIMIT ${batchSize}
          )`;
        if (removed > 0) {
          await this.audit.record(tx, {
            type: "access_records.purged",
            actorType: "SYSTEM",
            metadata: { count: removed, olderThan: cutoff.toISOString() },
          });
        }
        return removed;
      }),
    );
  }
}
