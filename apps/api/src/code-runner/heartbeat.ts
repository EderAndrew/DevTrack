import { Inject, Injectable } from "@nestjs/common";
import type { ExecutionKey } from "@repo/contracts";
import { CLOCK, type Clock } from "../platform/clock/clock";
import { APP_CONFIG } from "../platform/config/config.module";
import type { AppConfig } from "../platform/config/config.schema";
import { PrismaService } from "../platform/database/prisma.service";
import { SANDBOX, WORKER_ID } from "./tokens";
import type { SandboxPort } from "./sandbox/sandbox.port";

/** A beat every 5 s (research B10); the API treats a heartbeat older than `CODE_RUNNER_STALE_SECONDS` as a dead worker. */
export const HEARTBEAT_MS = 5000;
/** Rows of workers gone for more than a day are removed when a worker starts. */
const FORGOTTEN_MS = 24 * 3600 * 1000;

/**
 * The worker's heartbeat (019 research B10, data-model `code_runner_heartbeats`): which profiles this
 * worker can run now (the sandbox's answer, with their version labels; none when the daemon is down)
 * and the limits it applies, so the student screen shows what the worker really does. At most one
 * write per `HEARTBEAT_MS` unless forced; the last answer is what the worker claims for.
 */
@Injectable()
export class CodeRunnerHeartbeat {
  private lastBeatAt: number | null = null;
  private servedKeys: ExecutionKey[] = [];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SANDBOX) private readonly sandbox: SandboxPort,
    @Inject(WORKER_ID) private readonly workerId: string,
  ) {}

  /** The profiles of the last beat: the only runs this worker claims. */
  served(): readonly ExecutionKey[] {
    return this.servedKeys;
  }

  async beat(now: Date = this.clock.now(), force = false): Promise<void> {
    if (!force && this.lastBeatAt !== null && now.getTime() - this.lastBeatAt < HEARTBEAT_MS) return;
    let executions: { key: ExecutionKey; version: string }[];
    try {
      executions = await this.sandbox.profiles();
    } catch {
      // The daemon is down or an image is missing: this worker serves nothing until it answers again.
      executions = [];
    }
    const worker = this.config.codeRunner.worker;
    const data = {
      lastSeenAt: now,
      executions: executions.map(({ key, version }) => ({ key, version })),
      limits: { timeMs: worker.timeLimitMs, compileMs: worker.compileLimitMs, memoryMb: worker.memoryMb, outputBytes: worker.outputLimitBytes },
    };
    await this.prisma.codeRunnerHeartbeat.upsert({ where: { workerId: this.workerId }, create: { workerId: this.workerId, startedAt: now, ...data }, update: data });
    this.servedKeys = executions.map(({ key }) => key);
    this.lastBeatAt = now.getTime();
  }

  /** At start: forget the workers gone for more than a day. */
  async forgetOld(now: Date = this.clock.now()): Promise<void> {
    await this.prisma.codeRunnerHeartbeat.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - FORGOTTEN_MS) } } });
  }

  /** On a clean stop: the API sees the worker gone at once instead of after the stale window. */
  async remove(): Promise<void> {
    await this.prisma.codeRunnerHeartbeat.deleteMany({ where: { workerId: this.workerId } });
  }
}
