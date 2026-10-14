import { type ExecutionKey, ExecutionKeySchema } from "@repo/contracts";
import { PROFILES } from "../profiles";
import { type CaseResult, type PrepareResult, SandboxError, type SandboxLimits, type SandboxPort } from "./sandbox.port";

/** A case's result as the tests script it: by default a clean exit printing nothing. */
export const fakeCase = (overrides: Partial<CaseResult> = {}): CaseResult => ({
  exitCode: 0,
  stdout: "",
  stderr: "",
  durationMs: 50,
  timedOut: false,
  outputExceeded: false,
  oomKilled: false,
  ...overrides,
});

type CaseScript = CaseResult | ((call: { key: ExecutionKey; source: string; stdin: string }) => CaseResult);

/**
 * The sandbox of the test suite (research B14): nothing runs. `prepare` succeeds with the source as
 * the artifact unless `compileError` is set; each `runCase` takes the next scripted result (the last
 * one repeats), or echoes nothing. `failDaemon()` makes every call throw like an unreachable daemon.
 */
export class FakeSandbox implements SandboxPort {
  readonly calls = { profiles: 0, prepare: 0, runCase: 0 };
  /** What each `runCase` got, in order. */
  readonly cases: { key: ExecutionKey; source: string; stdin: string; limits: SandboxLimits; runId: string }[] = [];
  available: ExecutionKey[] = [...ExecutionKeySchema.options];
  private compileError: string | null = null;
  private script: CaseScript[] = [];
  private daemonDown: SandboxError["code"] | null = null;

  /** The next `runCase` results, in order; the last one repeats. */
  scriptCases(...results: CaseScript[]): this {
    this.script = results;
    return this;
  }

  /** Every `prepare` fails as a compilation error with this message. */
  failCompilation(output: string): this {
    this.compileError = output;
    return this;
  }

  /** Every call throws `SandboxError` (the run fails `SANDBOX_ERROR`); `null` brings it back. */
  failDaemon(code: SandboxError["code"] | null = "DAEMON_UNAVAILABLE"): this {
    this.daemonDown = code;
    return this;
  }

  profiles(): Promise<{ key: ExecutionKey; version: string }[]> {
    this.calls.profiles += 1;
    if (this.daemonDown) return Promise.reject(new SandboxError(this.daemonDown));
    return Promise.resolve(this.available.map((key) => ({ key, version: PROFILES[key].version })));
  }

  prepare(_key: ExecutionKey, source: string, _limits: SandboxLimits, _runId: string): Promise<PrepareResult> {
    this.calls.prepare += 1;
    if (this.daemonDown) return Promise.reject(new SandboxError(this.daemonDown));
    if (this.compileError !== null) return Promise.resolve({ ok: false, output: this.compileError });
    return Promise.resolve({ ok: true, artifact: new TextEncoder().encode(source) });
  }

  runCase(key: ExecutionKey, artifact: Uint8Array, stdin: string, limits: SandboxLimits, runId: string): Promise<CaseResult> {
    this.calls.runCase += 1;
    if (this.daemonDown) return Promise.reject(new SandboxError(this.daemonDown));
    const source = new TextDecoder().decode(artifact);
    this.cases.push({ key, source, stdin, limits, runId });
    const next = this.script.length > 1 ? this.script.shift()! : this.script[0];
    if (next === undefined) return Promise.resolve(fakeCase());
    return Promise.resolve(typeof next === "function" ? next({ key, source, stdin }) : next);
  }
}
