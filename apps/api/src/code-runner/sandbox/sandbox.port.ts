import type { ExecutionKey } from "@repo/contracts";

// The worker's only way to run student code (019 contracts/sandbox.md, research B4). The real
// implementation is `DockerSandbox` (one hardened container per step); the tests use `FakeSandbox`.

/** The limits of each step, from the worker's configuration (contracts/configuration.md). */
export interface SandboxLimits {
  /** Per case. */
  timeMs: number;
  /** The check/compile step. */
  compileMs: number;
  memoryMb: number;
  /** stdout per case. */
  outputBytes: number;
  pidsLimit: number;
}

export type PrepareResult = { ok: true; artifact: Uint8Array } | { ok: false; output: string };

export interface CaseResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  outputExceeded: boolean;
  oomKilled: boolean;
}

export interface SandboxPort {
  /** Profiles this host can run (images present), with version labels. */
  profiles(): Promise<{ key: ExecutionKey; version: string }[]>;
  /** Check/compile. `artifact` is what each case receives (the source, or the Java class tar). */
  prepare(key: ExecutionKey, source: string, limits: SandboxLimits, runId: string): Promise<PrepareResult>;
  /** One case in a fresh container. */
  runCase(key: ExecutionKey, artifact: Uint8Array, stdin: string, limits: SandboxLimits, runId: string): Promise<CaseResult>;
}

/**
 * The sandbox itself failed (daemon unreachable, image missing): the run fails `SANDBOX_ERROR`. It
 * carries a code, never Docker's stderr (research B12: logged only as an error code).
 */
export class SandboxError extends Error {
  override readonly name = "SandboxError";

  constructor(readonly code: "DAEMON_UNAVAILABLE" | "IMAGE_MISSING" | "ARTIFACT_TOO_LARGE" | "UNEXPECTED") {
    super(code);
  }
}
