import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Client } from "pg";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { LockKey } from "../database/transaction";

/** Jobs of contracts/maintenance-jobs.md, in execution order. */
export const MAINTENANCE_JOB_NAMES = [
  "unverified-accounts",
  "access-records",
  "audit-events",
  "rate-limit-counters",
] as const;

export type MaintenanceJobName = (typeof MAINTENANCE_JOB_NAMES)[number];

/** Rows removed per transaction, so no job holds locks for long (R21). */
export const MAINTENANCE_BATCH_SIZE = 1_000;

export interface MaintenanceJobContext {
  /** Reference instant of the run; tests pass a controlled clock. */
  now: Date;
  batchSize: number;
}

export interface MaintenanceJob {
  readonly name: MaintenanceJobName;
  /** Removes eligible rows in batches of `batchSize`; returns how many were removed. */
  run(context: MaintenanceJobContext): Promise<number>;
}

export interface MaintenanceJobResult {
  job: MaintenanceJobName;
  removed: number;
}

export type MaintenanceRunResult =
  | { status: "completed"; results: MaintenanceJobResult[] }
  /** Another instance (or run in this process) holds the maintenance lock. */
  | { status: "skipped" };

export interface MaintenanceRunOptions {
  job?: string;
  now?: Date;
}

export class UnknownMaintenanceJobError extends Error {
  constructor(readonly job: string) {
    super(`Unknown maintenance job "${job}"`);
    this.name = "UnknownMaintenanceJobError";
  }
}

/** Repeats `batch` until it removes fewer rows than `batchSize`; each call is its own transaction. */
export async function deleteInBatches(batchSize: number, batch: () => Promise<number>): Promise<number> {
  let total = 0;
  for (;;) {
    const removed = await batch();
    total += removed;
    if (removed < batchSize) return total;
  }
}

/**
 * Retention and cleanup jobs (R21, FR-017, FR-076, FR-077). Runs every
 * `MAINTENANCE_INTERVAL_SECONDS` inside the API (`0` disables it) and on demand through
 * `maintenance:run`. A run only proceeds while holding the session-level
 * `pg_try_advisory_lock(MAINTENANCE_LOCK)` on a dedicated connection, so with several
 * instances exactly one works; the lock is released with the connection even on a crash.
 * Logs carry job names and counts only.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("Maintenance");
  private readonly jobs = new Map<MaintenanceJobName, MaintenanceJob>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Called by each job's module on init. */
  register(job: MaintenanceJob): void {
    this.jobs.set(job.name, job);
  }

  registeredJobs(): MaintenanceJobName[] {
    return MAINTENANCE_JOB_NAMES.filter((name) => this.jobs.has(name));
  }

  async run(options: MaintenanceRunOptions = {}): Promise<MaintenanceRunResult> {
    const selected = this.select(options.job);
    if (this.running) return { status: "skipped" };

    this.running = true;
    const client = new Client({ connectionString: this.config.databaseUrl });
    try {
      await client.connect();
      const lockKey = LockKey.MAINTENANCE_LOCK.toString();
      const { rows } = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1::bigint) AS locked",
        [lockKey],
      );
      if (!rows[0]?.locked) return { status: "skipped" };

      try {
        const context: MaintenanceJobContext = {
          now: options.now ?? new Date(),
          batchSize: MAINTENANCE_BATCH_SIZE,
        };
        const results: MaintenanceJobResult[] = [];
        for (const job of selected) {
          const removed = await job.run(context);
          results.push({ job: job.name, removed });
          this.logger.log(`${job.name}: ${removed} removed`);
        }
        return { status: "completed", results };
      } finally {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey]);
      }
    } finally {
      this.running = false;
      await client.end().catch(() => undefined);
    }
  }

  onApplicationBootstrap(): void {
    const seconds = this.config.maintenanceIntervalSeconds;
    if (seconds <= 0) return;
    this.timer = setInterval(() => void this.runScheduled(), seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runScheduled(): Promise<void> {
    try {
      const result = await this.run();
      if (result.status === "skipped") this.logger.log("maintenance already running elsewhere");
    } catch (error) {
      this.logger.error(`maintenance run failed: ${error instanceof Error ? error.name : "unknown error"}`);
    }
  }

  private select(job: string | undefined): MaintenanceJob[] {
    if (job === undefined) return this.registeredJobs().map((name) => this.jobs.get(name)!);
    const found = this.jobs.get(job as MaintenanceJobName);
    if (!found) throw new UnknownMaintenanceJobError(job);
    return [found];
  }
}
