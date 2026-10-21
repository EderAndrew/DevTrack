import type { ExecutionConvention, ExecutionKey } from "@repo/contracts";
import type { SandboxLimits } from "./sandbox/sandbox.port";

// The execution profiles (019 contracts/sandbox.md, research B3–B5). The code knows profile keys,
// never catalog languages. The images are pinned by their multi-arch index digest (spike of
// 2026-10-14, research B4), so the same pin serves amd64 hosts and arm64 developer machines.

export interface Profile {
  key: ExecutionKey;
  image: string;
  /** Shown to the student with the result (FR-014). */
  version: string;
  convention: ExecutionConvention;
  /** Reads the source from stdin; a non-zero exit is a compilation error. Java writes the class tar to stdout. */
  compile(limits: SandboxLimits): string;
  /** Reads the framed artifact from stdin (`frame`), then the case input is the program's stdin. */
  run(limits: SandboxLimits): string;
}

/** `timeout` takes seconds; the limits are in milliseconds. */
const seconds = (ms: number) => String(ms / 1000);
/** The runtime's own heap stays below the container's memory, so it fails with its own message first. */
const heapMb = (limits: SandboxLimits) => Math.max(32, Math.floor(limits.memoryMb * 0.75));

/** Extracts the program written by `frame` into /tmp/p; what follows on stdin is the case input. */
export const PRELUDE = 'IFS= read -r n; head -c "$n" > /tmp/p; ';

export const PROFILES: Readonly<Record<ExecutionKey, Profile>> = {
  java: {
    key: "java",
    image: "eclipse-temurin:25-jdk@sha256:63f965b560b905c9633218330ac3516304b526a74fdc323a504b05c06e712c30",
    version: "Java 25",
    convention: "JAVA_MAIN_CLASS",
    compile: (limits) =>
      `mkdir /tmp/s /tmp/out && cat > /tmp/s/Main.java && timeout -s KILL ${seconds(limits.compileMs)} ` +
      "javac -proc:none -encoding UTF-8 -d /tmp/out /tmp/s/Main.java 1>&2 && tar -C /tmp/out -cf - .",
    run: (limits) =>
      `${PRELUDE}mkdir /tmp/c && tar -xf /tmp/p -C /tmp/c && exec timeout -s KILL ${seconds(limits.timeMs)} ` +
      `java -Xmx${heapMb(limits)}m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -cp /tmp/c Main`,
  },
  python: {
    key: "python",
    image: "python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f",
    version: "Python 3.13",
    convention: "STDIN_STDOUT",
    compile: (limits) =>
      `cat > /tmp/main.py && PYTHONPYCACHEPREFIX=/tmp/pyc timeout -s KILL ${seconds(limits.compileMs)} python3 -I -B -m py_compile /tmp/main.py`,
    run: (limits) => `${PRELUDE}mv /tmp/p /tmp/main.py && exec timeout -s KILL ${seconds(limits.timeMs)} python3 -I -B /tmp/main.py`,
  },
  javascript: {
    key: "javascript",
    image: "node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20",
    version: "Node.js 24",
    convention: "STDIN_STDOUT",
    compile: (limits) => `cat > /tmp/main.js && timeout -s KILL ${seconds(limits.compileMs)} node --check /tmp/main.js`,
    run: (limits) =>
      `${PRELUDE}mv /tmp/p /tmp/main.js && exec timeout -s KILL ${seconds(limits.timeMs)} node --max-old-space-size=${heapMb(limits)} /tmp/main.js`,
  },
};

/** The label every step container carries, so the worker can sweep leftovers (research B3). */
export const RUN_LABEL = "devtrack.code-run";

/**
 * `docker run` arguments of one step (research B3): no network, read-only root with a small tmpfs,
 * memory = memory + swap, one CPU, a pids cap, no capabilities, no new privileges, an unprivileged
 * user, file and descriptor caps, no IPC, no logs, and no environment from the worker. No volume or
 * bind mount: the program arrives on stdin. `--runtime` only when the worker is configured with one
 * other than Docker's default (`runsc`, gVisor, in production).
 */
export function dockerRunArgs(
  profile: Profile,
  command: string,
  limits: SandboxLimits,
  options: { runId: string; name: string; runtime: "runc" | "runsc" },
): string[] {
  return [
    "run",
    "--rm",
    "-i",
    "--name",
    options.name,
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=32m",
    "--memory",
    `${limits.memoryMb}m`,
    "--memory-swap",
    `${limits.memoryMb}m`,
    "--cpus",
    "1",
    "--pids-limit",
    String(limits.pidsLimit),
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "65534:65534",
    "--ulimit",
    "nofile=64:64",
    "--ulimit",
    "fsize=33554432",
    "--ipc",
    "none",
    "--log-driver",
    "none",
    "--env-file",
    "/dev/null",
    "--label",
    `${RUN_LABEL}=${options.runId}`,
    ...(options.runtime === "runc" ? [] : ["--runtime", options.runtime]),
    profile.image,
    "sh",
    "-c",
    command,
  ];
}

/** stdin of a case: the program's byte length on its own line, the program, then the case input. */
export function frame(program: Uint8Array, input: string): Uint8Array {
  const header = new TextEncoder().encode(`${program.byteLength}\n`);
  const body = new TextEncoder().encode(input);
  const framed = new Uint8Array(header.byteLength + program.byteLength + body.byteLength);
  framed.set(header, 0);
  framed.set(program, header.byteLength);
  framed.set(body, header.byteLength + program.byteLength);
  return framed;
}
