import type { CodeRun, ExecutionKey } from "@repo/contracts";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { CodeRunnerHeartbeat } from "../../src/code-runner/heartbeat";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { SandboxPort } from "../../src/code-runner/sandbox/sandbox.port";
import { CodeRunWorker } from "../../src/code-runner/worker";
import { PROFILES } from "../../src/code-runner/profiles";
import { AuditService } from "../../src/modules/audit/audit.service";
import type { Clock } from "../../src/platform/clock/clock";
import { type ActivityQuestionSpec, createActivity, type CreateActivityOptions } from "./activities";
import type { api, TestApp } from "./test-app";

// ── 019: the Code Runner in the suites (research B14) ───────────────────────────────────────
// The worker runs in-process with the `FakeSandbox` and the suite's clock: `runOnce(now)` claims one
// run, "executes" it and writes the result, exactly as `dist/code-runner/main.js` does with Docker.

type ApiClient = ReturnType<typeof api>;

/** The private cases carry it in the input and the expected output; no student response may. */
export const PRIVATE_RUN_MARKER = "MARCADOR-PRIVADO-019";

/** Two PUBLIC cases and a PRIVATE one between them (a private case never shifts a public position). */
export const DOUBLE_CASES = [
  { input: "1\n", expectedOutput: "2\n", visibility: "PUBLIC" as const },
  { input: `${PRIVATE_RUN_MARKER} entrada\n`, expectedOutput: `${PRIVATE_RUN_MARKER} saída\n`, visibility: "PRIVATE" as const },
  { input: "3\n", expectedOutput: "6\n", visibility: "PUBLIC" as const },
];

/** A program that doubles the input, as the FakeSandbox "runs" it: the right answer of `DOUBLE_CASES`. */
export const doubles = ({ stdin }: { stdin: string }) => fakeOutput(`${Number.parseInt(stdin, 10) * 2}\n`);

const fakeOutput = (stdout: string) => ({ exitCode: 0, stdout, stderr: "", durationMs: 40, timedOut: false, outputExceeded: false, oomKilled: false });

/**
 * An EXERCISE published a day ago with one CODE question of `languageKey` (default `python`) and the
 * `DOUBLE_CASES`, then, unless `questions` says otherwise, nothing else.
 */
export function createCodeExercise(
  t: TestApp,
  schoolClass: Pick<SchoolClass, "id" | "teacherId">,
  options: { languageKey?: string; testCases?: ActivityQuestionSpec["testCases"]; questions?: ActivityQuestionSpec[] } & Omit<CreateActivityOptions, "questions" | "type"> = {},
) {
  const { languageKey = "python", testCases = DOUBLE_CASES, questions, ...rest } = options;
  return createActivity(t, schoolClass, {
    type: "EXERCISE",
    questions: questions ?? [{ type: "CODE", languageKey, testCases, starterCode: "# leia a entrada\n" }],
    ...rest,
  });
}

/** `…/questions/:questionId/code-runs` of the session student. */
export const codeRunsPath = (activityId: string, questionId: string) => `/api/me/activities/${activityId}/questions/${questionId}/code-runs`;

export function requestRun(client: ApiClient, activityId: string, questionId: string, sourceCode = "print(int(input()) * 2)\n") {
  return client.post(codeRunsPath(activityId, questionId), { sourceCode });
}

export function getLatestRun(client: ApiClient, activityId: string, questionId: string) {
  return client.get(`${codeRunsPath(activityId, questionId)}/latest`);
}

export function getRun(client: ApiClient, runId: string) {
  return client.get(`/api/me/code-runs/${runId}`);
}

export const DEFAULT_HEARTBEAT_LIMITS = { timeMs: 2000, compileMs: 10_000, memoryMb: 256, outputBytes: 65_536 };

/**
 * A live worker's heartbeat seen at `at` (research B10), serving `executions` (default all three
 * profiles with their version labels). The API treats a profile as available while it is fresh.
 */
export async function seedHeartbeat(
  t: TestApp,
  at: Date,
  options: { workerId?: string; executions?: ExecutionKey[]; limits?: typeof DEFAULT_HEARTBEAT_LIMITS } = {},
): Promise<void> {
  const executions = (options.executions ?? (["java", "python", "javascript"] as const)).map((key) => ({ key, version: PROFILES[key].version }));
  const workerId = options.workerId ?? "worker-de-teste";
  const data = { lastSeenAt: at, executions, limits: options.limits ?? DEFAULT_HEARTBEAT_LIMITS };
  await t.prisma.codeRunnerHeartbeat.upsert({ where: { workerId }, create: { workerId, startedAt: at, ...data }, update: data });
}

/** The worker of a suite: the app's Prisma, audit and config, the suite's clock and a `FakeSandbox`. */
export function createRunWorker(t: TestApp, clock: Clock, options: { sandbox?: SandboxPort; workerId?: string } = {}) {
  const sandbox = options.sandbox ?? new FakeSandbox();
  const workerId = options.workerId ?? "worker-de-teste";
  const heartbeat = new CodeRunnerHeartbeat(t.prisma, t.config, clock, sandbox, workerId);
  const worker = new CodeRunWorker(t.prisma, t.get(AuditService), t.config, clock, sandbox, heartbeat, workerId);
  return { worker, heartbeat, sandbox };
}

/** Runs cycles until none claims a run; returns how many runs were processed. */
export async function drainRuns(worker: CodeRunWorker, now?: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const done = await worker.runOnce(now);
    if (done === 0) return total;
    total += done;
  }
}

export const asRun = (body: unknown) => body as CodeRun;
