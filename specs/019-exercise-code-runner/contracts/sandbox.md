# Sandbox Contract: 019 — `SandboxPort` and the language profiles

## Port (`apps/api/src/code-runner/sandbox/sandbox.port.ts`)

```ts
interface SandboxPort {
  /** Profiles this host can run (images present), with version labels. */
  profiles(): Promise<{ key: ExecutionKey; version: string }[]>;
  /** Check/compile. `artifact` is what each case receives (source, or the Java class tar). */
  prepare(key: ExecutionKey, source: string, limits: Limits):
    Promise<{ ok: true; artifact: Uint8Array } | { ok: false; output: string }>;
  /** One case in a fresh container. */
  runCase(key: ExecutionKey, artifact: Uint8Array, stdin: string, limits: Limits):
    Promise<{ exitCode: number | null; stdout: string; stderr: string; durationMs: number;
              timedOut: boolean; outputExceeded: boolean; oomKilled: boolean }>;
}
```

A thrown error (daemon unreachable, image missing) → the run fails `SANDBOX_ERROR`. `verdict.ts`
turns a `runCase` result into a verdict (research B6). `FakeSandbox` scripts these results in tests.

## Profiles (`apps/api/src/code-runner/profiles.ts`)

| Key | Image (pinned by digest) | Version label | Check/compile | Run | Convention |
|---|---|---|---|---|---|
| `java` | `eclipse-temurin:25-jdk` | Java 25 | `javac -proc:none -encoding UTF-8 -d /tmp/out Main.java` → tar of `/tmp/out` | `java -Xmx192m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -cp /tmp/c Main` | `JAVA_MAIN_CLASS` |
| `python` | `python:3.13-slim` | Python 3.13 | `python3 -I -B -m py_compile` (cache prefix `/tmp`) | `python3 -I -B /tmp/main.py` | `STDIN_STDOUT` |
| `javascript` | `node:24-slim` | Node.js 24 | `node --check /tmp/main.js` | `node --max-old-space-size=192 /tmp/main.js` | `STDIN_STDOUT` |

Every command is wrapped in `timeout -s KILL <limit>` inside the container, started with the flags of
research B3, and receives the program on stdin (length-prefixed, extracted into `/tmp` by an `sh`
prelude) followed by the case input.
