import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { ExecutionKey } from "@repo/contracts";
import { dockerRunArgs, frame, PROFILES, RUN_LABEL } from "../profiles";
import { type CaseResult, type PrepareResult, SandboxError, type SandboxLimits, type SandboxPort } from "./sandbox.port";

// The only file that starts processes (019 research B15, `code-runner-boundary.spec.ts`): the Docker
// CLI, with its arguments as a list and never through a shell of the host.

/** A compiler message and a case's stderr are kept up to 16 KB (contracts/configuration.md). */
const STDERR_CAP = 16_384;
/** The Java class tar of a program (contracts/configuration.md). */
const ARTIFACT_CAP = 1_048_576;
/** The worker's own timer gives the in-container `timeout` this much before `docker kill`. */
const KILL_GRACE_MS = 1000;
/** `docker run`'s own failures (the daemon, the image, the flags), never the program's. */
const DOCKER_RUN_FAILURE = new Set([125, 126, 127]);
/** `timeout -s KILL` and an OOM kill both end the process with SIGKILL: 128 + 9. */
const KILLED = 137;

interface Spawned {
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
  stdoutExceeded: boolean;
  /** The worker's timer killed the container. */
  killedByTimer: boolean;
  durationMs: number;
}

/** `docker pull <image>` (`pnpm --filter api code-runner:images`); resolves with the exit code. */
export function pullImage(image: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["pull", image], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/**
 * Runs `docker <args>`, writes `stdin` and reads stdout/stderr up to their caps. Past the stdout cap
 * or the timer, the container `name` is killed (`docker kill`) and the client process too. A `docker`
 * binary that can't start is the daemon unavailable.
 */
function runDocker(args: readonly string[], options: { stdin?: Uint8Array; stdoutCap: number; stderrCap: number; timeoutMs?: number; name?: string }): Promise<Spawned> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn("docker", [...args], { stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...dockerEnv() } });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let stdoutExceeded = false;
    let killedByTimer = false;
    let killed = false;
    const kill = () => {
      if (killed) return;
      killed = true;
      if (options.name) spawn("docker", ["kill", options.name], { stdio: "ignore", env: { PATH: process.env.PATH ?? "", ...dockerEnv() } }).on("error", () => undefined);
      child.kill("SIGKILL");
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
          killedByTimer = true;
          kill();
        }, options.timeoutMs)
      : null;
    child.stdout.on("data", (chunk: Buffer) => {
      if (outBytes < options.stdoutCap + 1) out.push(chunk.subarray(0, options.stdoutCap + 1 - outBytes));
      outBytes += chunk.byteLength;
      if (outBytes > options.stdoutCap && !stdoutExceeded) {
        stdoutExceeded = true;
        kill();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (errBytes < options.stderrCap) err.push(chunk.subarray(0, options.stderrCap - errBytes));
      errBytes += chunk.byteLength;
    });
    child.stdin.on("error", () => undefined); // the program may exit without reading its input
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(new SandboxError((error as NodeJS.ErrnoException).code === "ENOENT" ? "DAEMON_UNAVAILABLE" : "UNEXPECTED"));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const stdout = Buffer.concat(out);
      resolve({
        exitCode: code,
        stdout: stdoutExceeded ? stdout.subarray(0, options.stdoutCap) : stdout,
        stderr: Buffer.concat(err),
        stdoutExceeded,
        killedByTimer,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    child.stdin.end(options.stdin ? Buffer.from(options.stdin) : undefined);
  });
}

/** Only `DOCKER_HOST` (a remote daemon) reaches the Docker CLI; nothing else of the worker's environment. */
function dockerEnv(): Record<string, string> {
  return process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {};
}

/** A container name unique to the step: the label sweeps by run, the name kills one step. */
const containerName = (runId: string, step: string) => `devtrack-run-${runId.slice(0, 8)}-${step}-${randomBytes(4).toString("hex")}`;

/**
 * The real sandbox (019 research B1, B3, B4): every step — the check/compile, then each case — in a
 * fresh `docker run` with the hardening flags of `dockerRunArgs` (no network, read-only root, a small
 * tmpfs, memory, CPU, pids and file caps, no capabilities, an unprivileged user, gVisor's `runsc` in
 * production). The program arrives on stdin (framed for the cases), never through a mount. The time
 * limit is enforced twice: `timeout -s KILL` inside the container and the worker's timer with
 * `docker kill`. stdout is read up to the output limit (one byte more means OUTPUT_LIMIT and a kill),
 * stderr up to 16 KB.
 */
export class DockerSandbox implements SandboxPort {
  constructor(private readonly runtime: "runc" | "runsc") {}

  async profiles(): Promise<{ key: ExecutionKey; version: string }[]> {
    const daemon = await runDocker(["version", "--format", "{{.Server.Version}}"], { stdoutCap: 256, stderrCap: 256, timeoutMs: 10_000 });
    if (daemon.exitCode !== 0) throw new SandboxError("DAEMON_UNAVAILABLE");
    const present: { key: ExecutionKey; version: string }[] = [];
    for (const profile of Object.values(PROFILES)) {
      const inspected = await runDocker(["image", "inspect", "--format", "{{.Id}}", profile.image], { stdoutCap: 1024, stderrCap: 1024, timeoutMs: 10_000 });
      if (inspected.exitCode === 0) present.push({ key: profile.key, version: profile.version });
    }
    return present;
  }

  async prepare(key: ExecutionKey, source: string, limits: SandboxLimits, runId: string): Promise<PrepareResult> {
    const profile = PROFILES[key];
    const name = containerName(runId, "c");
    const result = await runDocker(dockerRunArgs(profile, profile.compile(limits), limits, { runId, name, runtime: this.runtime }), {
      stdin: new TextEncoder().encode(source),
      stdoutCap: ARTIFACT_CAP,
      stderrCap: STDERR_CAP,
      timeoutMs: limits.compileMs + KILL_GRACE_MS,
      name,
    });
    if (result.exitCode !== null && DOCKER_RUN_FAILURE.has(result.exitCode)) throw new SandboxError("UNEXPECTED");
    if (result.stdoutExceeded) throw new SandboxError("ARTIFACT_TOO_LARGE");
    if (result.exitCode !== 0) return { ok: false, output: result.stderr.toString("utf8") };
    // Java hands over its class files (the tar on stdout); the interpreted profiles their source.
    return { ok: true, artifact: key === "java" ? new Uint8Array(result.stdout) : new TextEncoder().encode(source) };
  }

  async runCase(key: ExecutionKey, artifact: Uint8Array, stdin: string, limits: SandboxLimits, runId: string): Promise<CaseResult> {
    const profile = PROFILES[key];
    const name = containerName(runId, "r");
    const result = await runDocker(dockerRunArgs(profile, profile.run(limits), limits, { runId, name, runtime: this.runtime }), {
      stdin: frame(artifact, stdin),
      stdoutCap: limits.outputBytes,
      stderrCap: STDERR_CAP,
      timeoutMs: limits.timeMs + KILL_GRACE_MS,
      name,
    });
    if (!result.killedByTimer && !result.stdoutExceeded && result.exitCode !== null && DOCKER_RUN_FAILURE.has(result.exitCode)) {
      throw new SandboxError("UNEXPECTED");
    }
    // A SIGKILL after the limit is the in-container `timeout`; before it, the memory cgroup (research B6).
    const timedOut = result.killedByTimer || (result.exitCode === KILLED && result.durationMs >= limits.timeMs);
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString("utf8"),
      stderr: result.stderr.toString("utf8"),
      durationMs: result.durationMs,
      timedOut,
      outputExceeded: result.stdoutExceeded,
      oomKilled: false,
    };
  }

  /** `docker rm -f` of the containers labelled for `runId` (or for any run). */
  async cleanup(runId: string | null): Promise<void> {
    const filter = runId === null ? RUN_LABEL : `${RUN_LABEL}=${runId}`;
    const listed = await runDocker(["ps", "-aq", "--filter", `label=${filter}`], { stdoutCap: 65_536, stderrCap: 1024, timeoutMs: 10_000 });
    const ids = listed.stdout.toString("utf8").split(/\s+/).filter(Boolean);
    if (ids.length > 0) await runDocker(["rm", "-f", ...ids], { stdoutCap: 65_536, stderrCap: 1024, timeoutMs: 30_000 });
  }
}
