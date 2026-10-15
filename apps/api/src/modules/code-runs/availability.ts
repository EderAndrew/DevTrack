import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { type ExecutionConvention, type ExecutionKey, ExecutionKeySchema, type QuestionExecution } from "@repo/contracts";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import { CodeRunAvailability as Hook, type ExecutionOf, type ExecutionQuestion } from "../activities/code-run-availability";

/** The program convention of each profile (FR-020): a key, the text lives in the web. */
const CONVENTIONS: Readonly<Record<ExecutionKey, ExecutionConvention>> = {
  java: "JAVA_MAIN_CLASS",
  python: "STDIN_STDOUT",
  javascript: "STDIN_STDOUT",
};

/** What one live worker serves, read from its heartbeat (research B10). */
export interface LiveProfile {
  version: string;
  limits: { timeMs: number; memoryMb: number; outputBytes: number };
}

/** The Code Runner as the API sees it at one instant: the kill switch and the live profiles. */
export interface RunnerState {
  enabled: boolean;
  profiles: ReadonlyMap<ExecutionKey, LiveProfile>;
}

/**
 * A CODE question's execution (019 research B17), pure: a language without a profile key can never
 * run (NOT_SUPPORTED), nor a question without a PUBLIC case (NO_PUBLIC_CASES); otherwise it runs when
 * the execution is on and a live worker serves the profile (AVAILABLE, with that worker's version and
 * limits), else UNAVAILABLE. The private cases never count.
 */
export function questionExecution(question: ExecutionQuestion, state: RunnerState): QuestionExecution {
  if (question.execution === null) return { status: "NOT_SUPPORTED", languageVersion: null, convention: null, limits: null };
  const convention = CONVENTIONS[question.execution];
  if (question.publicCaseCount === 0) return { status: "NO_PUBLIC_CASES", languageVersion: null, convention, limits: null };
  const live = state.enabled ? state.profiles.get(question.execution) : undefined;
  if (!live) return { status: "UNAVAILABLE", languageVersion: null, convention, limits: null };
  return { status: "AVAILABLE", languageVersion: live.version, convention, limits: live.limits };
}

interface HeartbeatRow {
  executions: unknown;
  limits: unknown;
}

/** The heartbeat's JSON, read defensively: a profile the API doesn't know is ignored. */
function profilesOf(rows: readonly HeartbeatRow[]): Map<ExecutionKey, LiveProfile> {
  const profiles = new Map<ExecutionKey, LiveProfile>();
  for (const row of rows) {
    const limits = row.limits as { timeMs?: unknown; memoryMb?: unknown; outputBytes?: unknown };
    if (![limits.timeMs, limits.memoryMb, limits.outputBytes].every((value) => typeof value === "number" && Number.isInteger(value) && value > 0)) continue;
    for (const entry of Array.isArray(row.executions) ? (row.executions as { key?: unknown; version?: unknown }[]) : []) {
      const key = ExecutionKeySchema.safeParse(entry.key);
      if (!key.success || typeof entry.version !== "string" || profiles.has(key.data)) continue;
      profiles.set(key.data, {
        version: entry.version,
        limits: { timeMs: limits.timeMs as number, memoryMb: limits.memoryMb as number, outputBytes: limits.outputBytes as number },
      });
    }
  }
  return profiles;
}

/**
 * Whether the Code Runner can run now (019 research B10): `CODE_RUNNER_ENABLED` and the heartbeats
 * newer than `CODE_RUNNER_STALE_SECONDS`, the most recent first (its version and limits are the ones
 * shown). Registered at startup on the activities' `CodeRunAvailability` hook, which the student view
 * asks; the run routes ask it directly.
 */
@Injectable()
export class RunnerAvailability implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hook: Hook,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.hook.register(async (now) => {
      const state = await this.state(now);
      return ((question) => questionExecution(question, state)) satisfies ExecutionOf;
    });
  }

  async state(now: Date): Promise<RunnerState> {
    if (!this.config.codeRunner.enabled) return { enabled: false, profiles: new Map() };
    const freshSince = new Date(now.getTime() - this.config.codeRunner.staleSeconds * 1000);
    const rows = await this.prisma.codeRunnerHeartbeat.findMany({
      where: { lastSeenAt: { gt: freshSince } },
      orderBy: { lastSeenAt: "desc" },
      select: { executions: true, limits: true },
    });
    return { enabled: true, profiles: profilesOf(rows) };
  }
}
