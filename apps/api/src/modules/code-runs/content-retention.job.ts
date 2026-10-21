import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../../platform/maintenance/maintenance.service";

const HOUR_MS = 3_600_000;

/** Runs purged per transaction (019 contracts/configuration.md). */
export const CODE_RUN_PURGE_BATCH_SIZE = 500;

/**
 * Empties the content of final runs (019/FR-019, research B12): the source code, the compiler
 * message and each case's stdout and stderr become NULL and `content_purged_at` is set, in batches.
 * The rows stay (status, verdicts, counts and times), and the triggers accept nothing else on a
 * final run. A run is purged once its `finished_at` is older than `CODE_RUN_CONTENT_RETENTION_HOURS`
 * minus `MAINTENANCE_INTERVAL_SECONDS` (23 h with the defaults), so no content outlives the retention
 * between two maintenance runs. Only counts are logged, and no audit event is written (a purge of
 * technical records, as `ai-records`).
 */
@Injectable()
export class CodeRunContentJob implements MaintenanceJob, OnModuleInit {
  readonly name = "code-run-content";

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  run({ now }: MaintenanceJobContext): Promise<number> {
    const keepMs = Math.max(
      0,
      this.config.codeRunner.contentRetentionHours * HOUR_MS - this.config.maintenanceIntervalSeconds * 1000,
    );
    const cutoff = new Date(now.getTime() - keepMs);
    const batchSize = CODE_RUN_PURGE_BATCH_SIZE;
    return deleteInBatches(batchSize, () =>
      this.prisma.runInTransaction(
        (tx) => tx.$executeRaw`
          WITH picked AS (
            SELECT r.id FROM code_runs r
            WHERE r.content_purged_at IS NULL
              AND r.status IN ('COMPLETED', 'FAILED')
              AND r.finished_at < ${cutoff}::timestamptz
            ORDER BY r.finished_at, r.id
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
          ), cases AS (
            UPDATE code_run_cases SET stdout = NULL, stderr = NULL
            WHERE run_id IN (SELECT id FROM picked) AND (stdout IS NOT NULL OR stderr IS NOT NULL)
          )
          UPDATE code_runs
          SET source_code = NULL, compile_output = NULL, content_purged_at = ${now}::timestamptz
          WHERE id IN (SELECT id FROM picked)`,
      ),
    );
  }
}
