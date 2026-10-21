import { hostname } from "node:os";

/** The `SandboxPort` of the worker: `DockerSandbox` in `main.ts`, a `FakeSandbox` in the suites. */
export const SANDBOX = Symbol("CODE_RUNNER_SANDBOX");

/** This worker's id in the heartbeats and the claims (data-model: host + pid + start). */
export const WORKER_ID = Symbol("CODE_RUNNER_WORKER_ID");

export const defaultWorkerId = (startedAt: Date = new Date()) => `${hostname()}:${process.pid}:${startedAt.toISOString()}`;
