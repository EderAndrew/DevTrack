import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { PrismaService } from "../../../platform/database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { AiProposalsService } from "../proposals/ai-proposals.service";
import { AiExecutionStore } from "./ai-execution.store";
import { AiExecutionRunner, type ClaimedExecution } from "./ai-execution.runner";

/** Executions claimed per cycle (research A6). */
const BATCH_SIZE = 2;
const NON_FINAL = ["QUEUED", "RUNNING", "WAITING_TOOL", "VALIDATING_OUTPUT"] as const;

/**
 * Processes queued AI executions (006 research A6, A9), in the shape of the 004 syllabus worker.
 * The `ai_executions` table is the queue: a cycle first expires overdue proposals, ends every execution past its deadline as
 * TIMED_OUT (including one whose process died mid-run), then claims up to 2 QUEUED executions with
 * `FOR UPDATE SKIP LOCKED` and a fresh `claim_token` (each is processed once, FR-024) and runs them.
 * `AI_EXECUTION_INTERVAL_SECONDS=0` turns everything off, `kick()` included (global kill switch);
 * tests call `runOnce(now)`.
 */
@Injectable()
export class AiExecutionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("AiExecutionWorker");
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly runner: AiExecutionRunner,
    private readonly store: AiExecutionStore,
    private readonly audit: AuditService,
    private readonly proposals: AiProposalsService,
  ) {}

  /** One cycle at `now`; returns how many executions it claimed. */
  async runOnce(now = new Date()): Promise<number> {
    await this.proposals.expireDue(now);
    await this.sweepDeadlines(now);
    const claimed = await this.claim(now);
    await Promise.all(
      claimed.map((execution) =>
        this.runner.run(execution).catch((error: unknown) => {
          this.logger.error({ executionId: execution.id, errorName: error instanceof Error ? error.name : "unknown" }, "ai.worker_run_failed");
        }),
      ),
    );
    return claimed.length;
  }

  /** Starts a cycle right away (after a request) without overlapping a running one. */
  kick(): void {
    if (this.config.ai.intervalSeconds <= 0) return;
    void this.runScheduled();
  }

  onApplicationBootstrap(): void {
    const seconds = this.config.ai.intervalSeconds;
    if (seconds <= 0) return;
    this.timer = setInterval(() => void this.runScheduled(), seconds * 1000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.again = false;
    await this.running;
  }

  private runScheduled(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.runOnce();
        } while (this.again);
      } catch (error) {
        this.logger.error({ errorName: error instanceof Error ? error.name : "unknown" }, "ai.worker_cycle_failed");
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /** Non-final executions past their deadline end TIMED_OUT (SC-005, research A9). */
  private async sweepDeadlines(now: Date): Promise<void> {
    const overdue = await this.prisma.aiExecution.findMany({
      where: { status: { in: [...NON_FINAL] }, deadlineAt: { lt: now } },
      select: { id: true },
      take: 100,
    });
    for (const { id } of overdue) {
      await this.prisma.runInTransaction((tx) =>
        this.store.finish(tx, { executionId: id, from: NON_FINAL, to: "TIMED_OUT", errorCode: "AI_TIMEOUT", now, claimToken: null, actor: { type: "SYSTEM" } }),
      );
    }
  }

  private claim(now: Date): Promise<ClaimedExecution[]> {
    return this.prisma.runInTransaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; claim_token: string; claims: number }[]>`
        UPDATE ai_executions
        SET status = 'RUNNING',
            claim_token = gen_random_uuid(),
            claims = claims + 1,
            lease_expires_at = deadline_at,
            started_at = COALESCE(started_at, ${now}::timestamptz),
            step = 'CONTEXT_RESOLVED'
        WHERE id IN (
          SELECT id FROM ai_executions
          WHERE status = 'QUEUED' AND deadline_at >= ${now}::timestamptz
          ORDER BY created_at, id
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED)
        RETURNING id, claim_token, claims`;
      for (const row of rows) {
        await tx.aiExecutionTransition.create({ data: { executionId: row.id, fromStatus: "QUEUED", toStatus: "RUNNING", occurredAt: now } });
        await this.audit.record(tx, {
          type: "ai_execution.started",
          actorType: "SYSTEM",
          targetType: "AI_EXECUTION",
          targetId: row.id,
          metadata: { claim: row.claims },
        });
      }
      return rows.map((row) => ({ id: row.id, claimToken: row.claim_token }));
    });
  }
}
