import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../../platform/maintenance/maintenance.service";
import { AuditService } from "../audit/audit.service";

/** FR-077: audit events are kept for 5 years. */
export const AUDIT_RETENTION_YEARS = 5;

export function auditRetentionCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - AUDIT_RETENTION_YEARS);
  return cutoff;
}

/**
 * Purges `audit_events` older than 5 years (FR-077, R23). The append-only trigger only allows
 * this DELETE when the transaction sets `devtrack.audit_purge = 'on'` and only for rows older
 * than `now() - 5 years` by the database clock, so the query also bounds itself by that
 * clock. Each batch records `audit.purged` in its own transaction.
 */
@Injectable()
export class AuditRetentionJob implements MaintenanceJob, OnModuleInit {
  readonly name = "audit-events";

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  run({ now, batchSize }: MaintenanceJobContext): Promise<number> {
    const cutoff = auditRetentionCutoff(now);
    return deleteInBatches(batchSize, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('devtrack.audit_purge', 'on', true)`;
        const removed = await tx.$executeRaw`
          DELETE FROM audit_events
          WHERE id IN (
            SELECT id FROM audit_events
            WHERE occurred_at < ${cutoff}::timestamptz AND occurred_at < now() - interval '5 years'
            ORDER BY id
            LIMIT ${batchSize}
          )`;
        await tx.$executeRaw`SELECT set_config('devtrack.audit_purge', 'off', true)`;
        if (removed > 0) {
          await this.audit.record(tx, {
            type: "audit.purged",
            actorType: "SYSTEM",
            metadata: { count: removed, olderThan: cutoff.toISOString() },
          });
        }
        return removed;
      }),
    );
  }
}
