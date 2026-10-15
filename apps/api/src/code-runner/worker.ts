import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import type { CodeRunVerdict, ExecutionKey } from "@repo/contracts";
import { Prisma } from "../generated/prisma/client";
import { AuditService } from "../modules/audit/audit.service";
import { recordFinished, settleStaleRuns } from "../modules/code-runs/settle-stale";
import { caseVerdict, summarizeVerdicts } from "../modules/code-runs/verdict";
import { CLOCK, type Clock } from "../platform/clock/clock";
import { APP_CONFIG } from "../platform/config/config.module";
import type { AppConfig } from "../platform/config/config.schema";
import { PrismaService } from "../platform/database/prisma.service";
import { CodeRunnerHeartbeat, HEARTBEAT_MS } from "./heartbeat";
import { type CaseResult, SandboxError, type SandboxLimits, type SandboxPort } from "./sandbox/sandbox.port";
import { SANDBOX, WORKER_ID } from "./tokens";

/** What the database keeps of a case's stdout, stderr and a compiler message (CHECKs of the migration). */
const STDOUT_MAX_BYTES = 65_536;
const STDERR_MAX_BYTES = 16_384;
const COMPILE_OUTPUT_MAX_BYTES = 16_384;

interface ClaimedRun {
  id: string;
  execution: ExecutionKey;
  sourceCode: string;
  questionId: string;
  publicCaseCount: number;
  createdAt: Date;
  claimToken: string;
}

interface PublicCase {
  id: string;
  input: string;
  expectedOutput: string;
}

type RunResult =
  | { outcome: "COMPILATION_ERROR"; compileOutput: string }
  | { outcome: "EXECUTED"; cases: { testCaseId: string; result: CaseResult; verdict: CodeRunVerdict }[] };

/**
 * Cuts `text` to at most `maxBytes` of UTF-8 without splitting a character, and replaces NUL (which
 * a PostgreSQL text column refuses) by U+FFFD: a program's output is untrusted bytes.
 */
export function storableText(text: string, maxBytes: number): string {
  const clean = text.replaceAll(String.fromCharCode(0), "\uFFFD");
  const bytes = new TextEncoder().encode(clean);
  if (bytes.byteLength <= maxBytes) return clean;
  let end = maxBytes;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/** An empty program prints nothing and exits cleanly: its verdicts need no container (spec Edge Cases). */
const EMPTY_PROGRAM: CaseResult = { exitCode: 0, stdout: "", stderr: "", durationMs: 0, timedOut: false, outputExceeded: false, oomKilled: false };

/**
 * The Code Runner worker (019 research B2, B4, B8): a process of its own (`dist/code-runner/main.js`),
 * never the API. Each cycle beats the heartbeat, settles the stale runs (expired in the queue, lease
 * passed), claims the oldest QUEUED run of a profile it serves (`FOR UPDATE SKIP LOCKED`, so several
 * workers never take the same run) and runs it through the `SandboxPort`: the check/compile step,
 * then each PUBLIC case in a fresh container, in order. The verdicts come from the pure
 * `verdict.ts`/`compare-output.ts`; the cases, COMPLETED and `code_run.finished` are written in one
 * transaction guarded by the claim's token, so a worker whose lease was taken writes nothing. A
 * sandbox failure fails the run `SANDBOX_ERROR`. Logs carry ids, enums and counts, never content.
 * `CODE_RUNNER_CONCURRENCY` loops share the work; tests call `runOnce(now)`.
 */
@Injectable()
export class CodeRunWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("CodeRunWorker");
  private loops: Promise<void>[] = [];
  private stopping = false;
  private wake: (() => void)[] = [];
  private beatTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SANDBOX) private readonly sandbox: SandboxPort,
    private readonly heartbeat: CodeRunnerHeartbeat,
    @Inject(WORKER_ID) private readonly workerId: string,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.heartbeat.forgetOld();
    await this.sandbox.cleanup?.(null);
    this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  /** One cycle at `now`: returns how many runs it executed (0 or 1). */
  async runOnce(now: Date = this.clock.now()): Promise<number> {
    const enabled = this.config.codeRunner.enabled;
    await this.heartbeat.beat(now);
    await this.prisma.runInTransaction((tx) => settleStaleRuns(tx, this.audit, { now, scope: "ALL", disabled: !enabled }));
    const served = this.heartbeat.served();
    if (!enabled || served.length === 0) return 0;
    const run = await this.claim(now, served);
    if (!run) return 0;
    await this.execute(run);
    return 1;
  }

  /** The concurrency loops and the heartbeat timer (the heartbeat keeps beating while a run is long). */
  start(): void {
    if (this.loops.length > 0) return;
    this.stopping = false;
    this.beatTimer = setInterval(() => {
      this.heartbeat.beat().catch(() => this.logger.warn({ code: "HEARTBEAT_FAILED" }, "code_runner.heartbeat_failed"));
    }, HEARTBEAT_MS);
    this.beatTimer.unref();
    for (let slot = 0; slot < this.config.codeRunner.worker.concurrency; slot += 1) this.loops.push(this.loop());
  }

  /**
   * Stops claiming and waits for the runs in progress (SIGTERM). A run that can't finish is settled
   * INTERRUPTED by the next touch once its lease passes; it is never executed twice.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.beatTimer) clearInterval(this.beatTimer);
    this.beatTimer = null;
    for (const wake of this.wake.splice(0)) wake();
    await Promise.all(this.loops);
    this.loops = [];
    await this.heartbeat.remove().catch(() => undefined);
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      let done = 0;
      try {
        done = await this.runOnce();
      } catch (error) {
        this.logger.error({ code: error instanceof SandboxError ? error.code : "CYCLE_FAILED" }, "code_runner.cycle_failed");
      }
      if (done === 0 && !this.stopping) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, this.config.codeRunner.worker.pollMs);
          this.wake.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    }
  }

  /** The oldest QUEUED run within its deadline, of a profile this worker serves: RUNNING with a new claim. */
  private async claim(now: Date, served: readonly ExecutionKey[]): Promise<ClaimedRun | null> {
    const claimToken = randomUUID();
    const leaseUntil = new Date(now.getTime() + this.config.codeRunner.worker.leaseSeconds * 1000);
    const rows = await this.prisma.$queryRaw<
      { id: string; execution: ExecutionKey; source_code: string; question_id: string; public_case_count: number; created_at: Date }[]
    >`
      WITH next AS (
        SELECT id FROM code_runs
        WHERE status = 'QUEUED' AND deadline_at > ${now} AND execution IN (${Prisma.join([...served])})
        ORDER BY created_at, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE code_runs r
      SET status = 'RUNNING', claimed_at = ${now}, lease_until = ${leaseUntil}, claimed_by = ${this.workerId}, claim_token = ${claimToken}::uuid
      FROM next
      WHERE r.id = next.id
      RETURNING r.id, r.execution, r.source_code, r.question_id, r.public_case_count, r.created_at`;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      execution: row.execution,
      sourceCode: row.source_code,
      questionId: row.question_id,
      publicCaseCount: row.public_case_count,
      createdAt: row.created_at,
      claimToken,
    };
  }

  private async execute(run: ClaimedRun): Promise<void> {
    const cases: PublicCase[] = await this.prisma.classActivityTestCase.findMany({
      where: { questionId: run.questionId, visibility: "PUBLIC" },
      orderBy: { position: "asc" },
      select: { id: true, input: true, expectedOutput: true },
    });
    let result: RunResult;
    try {
      result = await this.runInSandbox(run, cases);
    } catch (error) {
      const code = error instanceof SandboxError ? error.code : "UNEXPECTED";
      this.logger.warn({ runId: run.id, profile: run.execution, code }, "code_run.sandbox_error");
      await this.fail(run);
      return;
    } finally {
      await this.sandbox.cleanup?.(run.id).catch(() => undefined);
    }
    await this.complete(run, result);
  }

  private async runInSandbox(run: ClaimedRun, cases: readonly PublicCase[]): Promise<RunResult> {
    const worker = this.config.codeRunner.worker;
    const limits: SandboxLimits = {
      timeMs: worker.timeLimitMs,
      compileMs: worker.compileLimitMs,
      memoryMb: worker.memoryMb,
      outputBytes: worker.outputLimitBytes,
      pidsLimit: worker.pidsLimit,
    };
    const verdictOf = (testCase: PublicCase, result: CaseResult) => ({ testCaseId: testCase.id, result, verdict: caseVerdict(result, testCase.expectedOutput) });
    if (run.sourceCode === "") return { outcome: "EXECUTED", cases: cases.map((testCase) => verdictOf(testCase, EMPTY_PROGRAM)) };

    const prepared = await this.sandbox.prepare(run.execution, run.sourceCode, limits, run.id);
    if (!prepared.ok) return { outcome: "COMPILATION_ERROR", compileOutput: prepared.output };
    const executed: { testCaseId: string; result: CaseResult; verdict: CodeRunVerdict }[] = [];
    for (const testCase of cases) {
      executed.push(verdictOf(testCase, await this.sandbox.runCase(run.execution, prepared.artifact, testCase.input, limits, run.id)));
    }
    return { outcome: "EXECUTED", cases: executed };
  }

  /** COMPLETED with its cases and `code_run.finished`, only while this worker's claim still holds. */
  private async complete(run: ClaimedRun, result: RunResult): Promise<void> {
    const finishedAt = this.clock.now();
    const verdicts = result.outcome === "EXECUTED" ? result.cases.map((item) => item.verdict) : [];
    const summary = summarizeVerdicts(verdicts);
    const written = await this.prisma.runInTransaction(async (tx) => {
      const updated = await tx.codeRun.updateMany({
        where: { id: run.id, status: "RUNNING", claimToken: run.claimToken },
        data: {
          status: "COMPLETED",
          outcome: result.outcome,
          passedCount: summary.passedCount,
          compileOutput: result.outcome === "COMPILATION_ERROR" ? storableText(result.compileOutput, COMPILE_OUTPUT_MAX_BYTES) : null,
          finishedAt,
        },
      });
      if (updated.count === 0) return false;
      if (result.outcome === "EXECUTED") {
        await tx.codeRunCase.createMany({
          data: result.cases.map((item, position) => ({
            runId: run.id,
            testCaseId: item.testCaseId,
            position,
            verdict: item.verdict,
            stdout: storableText(item.result.stdout, STDOUT_MAX_BYTES),
            stderr: storableText(item.result.stderr, STDERR_MAX_BYTES),
            exitCode: item.result.exitCode,
            durationMs: Math.max(0, Math.round(item.result.durationMs)),
          })),
        });
      }
      await recordFinished(tx, this.audit, {
        runId: run.id,
        status: "COMPLETED",
        outcome: result.outcome,
        failureReason: null,
        passedCount: summary.passedCount,
        publicCaseCount: run.publicCaseCount,
        durationMs: Math.max(0, finishedAt.getTime() - run.createdAt.getTime()),
        verdicts: summary.verdicts,
      });
      return true;
    });
    if (!written) this.logger.warn({ runId: run.id }, "code_run.claim_lost");
    else this.logger.log({ runId: run.id, profile: run.execution, outcome: result.outcome, passedCount: summary.passedCount }, "code_run.finished");
  }

  /** FAILED/SANDBOX_ERROR, only while this worker's claim still holds. */
  private async fail(run: ClaimedRun): Promise<void> {
    const finishedAt = this.clock.now();
    await this.prisma.runInTransaction(async (tx) => {
      const updated = await tx.codeRun.updateMany({
        where: { id: run.id, status: "RUNNING", claimToken: run.claimToken },
        data: { status: "FAILED", failureReason: "SANDBOX_ERROR", finishedAt },
      });
      if (updated.count === 0) return;
      await recordFinished(tx, this.audit, {
        runId: run.id,
        status: "FAILED",
        outcome: null,
        failureReason: "SANDBOX_ERROR",
        passedCount: null,
        publicCaseCount: run.publicCaseCount,
        durationMs: Math.max(0, finishedAt.getTime() - run.createdAt.getTime()),
        verdicts: summarizeVerdicts([]).verdicts,
      });
    });
  }
}
