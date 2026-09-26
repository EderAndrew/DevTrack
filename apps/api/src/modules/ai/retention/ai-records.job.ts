import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { PrismaService } from "../../../platform/database/prisma.service";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../../../platform/maintenance/maintenance.service";

const DAY_MS = 86_400_000;

/**
 * Deletes final AI executions finished more than `AI_RECORD_RETENTION_DAYS` ago (006 research,
 * "Retenção"), in batches. Transitions, model and tool calls, output, usage and proposal go with
 * them by cascade. An execution whose proposal still waits for the teacher (`READY_FOR_REVIEW`)
 * is kept. Audit events follow their own retention (001); evaluation cases and results never
 * expire. Only counts are logged, and no audit event is written (a purge of technical records).
 */
@Injectable()
export class AiRecordsJob implements MaintenanceJob, OnModuleInit {
  readonly name = "ai-records";

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  run({ now, batchSize }: MaintenanceJobContext): Promise<number> {
    const cutoff = new Date(now.getTime() - this.config.ai.retentionDays * DAY_MS);
    return deleteInBatches(batchSize, () =>
      this.prisma.runInTransaction(
        (tx) => tx.$executeRaw`
          DELETE FROM ai_executions
          WHERE id IN (
            SELECT e.id FROM ai_executions e
            WHERE e.finished_at IS NOT NULL
              AND e.finished_at < ${cutoff}::timestamptz
              AND NOT EXISTS (
                SELECT 1 FROM ai_proposals p
                WHERE p.execution_id = e.id AND p.status = 'READY_FOR_REVIEW'
              )
            ORDER BY e.finished_at, e.id
            LIMIT ${batchSize}
            FOR UPDATE OF e SKIP LOCKED
          )`,
      ),
    );
  }
}
