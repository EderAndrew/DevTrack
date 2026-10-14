import { ExecutionKeySchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { dockerRunArgs, frame, PRELUDE, PROFILES, RUN_LABEL } from "./profiles";
import { fakeCase, FakeSandbox } from "./sandbox/fake-sandbox";
import { SandboxError, type SandboxLimits } from "./sandbox/sandbox.port";

const LIMITS: SandboxLimits = { timeMs: 2000, compileMs: 10_000, memoryMb: 256, outputBytes: 65_536, pidsLimit: 128 };
const RUN_ID = "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10";
const args = (runtime: "runc" | "runsc" = "runc", command = "true") =>
  dockerRunArgs(PROFILES.python, command, LIMITS, { runId: RUN_ID, name: `devtrack-run-${RUN_ID}-0`, runtime });
/** The value right after `flag`, for each time it appears. */
const valuesOf = (list: string[], flag: string) => list.flatMap((value, index) => (value === flag ? [list[index + 1]] : []));

describe("019/FR-013 perfis e contêineres do sandbox (contracts/sandbox.md, research B3–B5)", () => {
  it("019/FR-020 um perfil por chave de execução, com imagem fixada por digest, versão e convenção", () => {
    expect(Object.keys(PROFILES).sort()).toEqual([...ExecutionKeySchema.options].sort());
    for (const profile of Object.values(PROFILES)) {
      expect(profile.image, profile.key).toMatch(/^[a-z0-9.-]+:[a-z0-9.-]+@sha256:[0-9a-f]{64}$/);
    }
    expect(Object.values(PROFILES).map((profile) => [profile.key, profile.version, profile.convention])).toEqual([
      ["java", "Java 25", "JAVA_MAIN_CLASS"],
      ["python", "Python 3.13", "STDIN_STDOUT"],
      ["javascript", "Node.js 24", "STDIN_STDOUT"],
    ]);
  });

  it("019/FR-014 comandos montados com os limites: timeout -s KILL na compilação e em cada caso, heap abaixo da memória", () => {
    expect(PROFILES.java.compile(LIMITS)).toContain("timeout -s KILL 10 javac -proc:none -encoding UTF-8 -d /tmp/out /tmp/s/Main.java");
    expect(PROFILES.java.compile(LIMITS)).toContain("tar -C /tmp/out -cf - .");
    expect(PROFILES.java.run(LIMITS)).toBe(
      `${PRELUDE}mkdir /tmp/c && tar -xf /tmp/p -C /tmp/c && exec timeout -s KILL 2 java -Xmx192m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -cp /tmp/c Main`,
    );
    expect(PROFILES.python.compile(LIMITS)).toContain("PYTHONPYCACHEPREFIX=/tmp/pyc timeout -s KILL 10 python3 -I -B -m py_compile /tmp/main.py");
    expect(PROFILES.python.run(LIMITS)).toBe(`${PRELUDE}mv /tmp/p /tmp/main.py && exec timeout -s KILL 2 python3 -I -B /tmp/main.py`);
    expect(PROFILES.javascript.compile(LIMITS)).toContain("timeout -s KILL 10 node --check /tmp/main.js");
    expect(PROFILES.javascript.run(LIMITS)).toBe(
      `${PRELUDE}mv /tmp/p /tmp/main.js && exec timeout -s KILL 2 node --max-old-space-size=192 /tmp/main.js`,
    );
    const custom = { ...LIMITS, timeMs: 2500, compileMs: 15_000, memoryMb: 512 };
    expect(PROFILES.java.run(custom)).toContain("timeout -s KILL 2.5 java -Xmx384m");
    expect(PROFILES.javascript.compile(custom)).toContain("timeout -s KILL 15 node --check");
  });

  it("019/FR-013 flags de B3 em todo contêiner: sem rede, raiz só leitura, tmpfs, memória = memória + swap, CPU, pids, sem capacidades", () => {
    const list = args();
    expect(list.slice(0, 3)).toEqual(["run", "--rm", "-i"]);
    expect(valuesOf(list, "--network")).toEqual(["none"]);
    expect(list).toContain("--read-only");
    expect(valuesOf(list, "--tmpfs")).toEqual(["/tmp:rw,nosuid,nodev,size=32m"]);
    expect(valuesOf(list, "--memory")).toEqual(["256m"]);
    expect(valuesOf(list, "--memory-swap")).toEqual(["256m"]);
    expect(valuesOf(list, "--cpus")).toEqual(["1"]);
    expect(valuesOf(list, "--pids-limit")).toEqual(["128"]);
    expect(valuesOf(list, "--cap-drop")).toEqual(["ALL"]);
    expect(valuesOf(list, "--security-opt")).toEqual(["no-new-privileges"]);
    expect(valuesOf(list, "--user")).toEqual(["65534:65534"]);
    expect(valuesOf(list, "--ulimit")).toEqual(["nofile=64:64", "fsize=33554432"]);
    expect(valuesOf(list, "--ipc")).toEqual(["none"]);
    expect(valuesOf(list, "--log-driver")).toEqual(["none"]);
    expect(valuesOf(list, "--label")).toEqual([`${RUN_LABEL}=${RUN_ID}`]);
    expect(list.slice(-4)).toEqual([PROFILES.python.image, "sh", "-c", "true"]);
  });

  it("019/FR-013 nenhuma variável de ambiente do worker, volume ou montagem chega ao contêiner", () => {
    const list = args();
    expect(valuesOf(list, "--env-file")).toEqual(["/dev/null"]);
    for (const flag of ["-e", "--env", "-v", "--volume", "--mount", "--privileged", "--network=host", "--pid", "--device", "-p", "--publish"]) {
      expect(list, flag).not.toContain(flag);
    }
    const secrets = Object.values(process.env).filter((value): value is string => typeof value === "string" && value.length >= 8);
    for (const value of list) expect(secrets).not.toContain(value);
  });

  it("019/FR-013 --runtime só quando configurado com outro que não o padrão do Docker", () => {
    expect(args("runc")).not.toContain("--runtime");
    expect(valuesOf(args("runsc"), "--runtime")).toEqual(["runsc"]);
    // The runtime comes before the image, as a docker flag, never as part of the command.
    const list = args("runsc");
    expect(list.indexOf("--runtime")).toBeLessThan(list.indexOf(PROFILES.python.image));
  });

  it("019/FR-006 enquadramento: tamanho em bytes do programa (multibyte), o programa e a entrada do caso", () => {
    const program = new TextEncoder().encode('print("ação ✓ 😀")\n');
    const framed = new TextDecoder().decode(frame(program, "1\n2\n"));
    expect(program.byteLength).toBe(25);
    expect(framed).toBe('25\nprint("ação ✓ 😀")\n1\n2\n');
    const empty = frame(new Uint8Array(), "");
    expect(new TextDecoder().decode(empty)).toBe("0\n");
    const binary = new Uint8Array([0, 255, 10, 13]);
    const withBinary = frame(binary, "x");
    expect([...withBinary]).toEqual([...new TextEncoder().encode("4\n"), 0, 255, 10, 13, ...new TextEncoder().encode("x")]);
  });
});

describe("019 FakeSandbox (research B14)", () => {
  it("roteiriza casos, conta chamadas, simula erro de compilação e daemon fora", async () => {
    const sandbox = new FakeSandbox().scriptCases(fakeCase({ stdout: "1\n" }), fakeCase({ exitCode: 1 }));
    expect(await sandbox.profiles()).toEqual([
      { key: "java", version: "Java 25" },
      { key: "python", version: "Python 3.13" },
      { key: "javascript", version: "Node.js 24" },
    ]);
    const prepared = await sandbox.prepare("python", "print(1)", LIMITS, RUN_ID);
    expect(prepared.ok).toBe(true);
    const artifact = prepared.ok ? prepared.artifact : new Uint8Array();
    expect((await sandbox.runCase("python", artifact, "a", LIMITS, RUN_ID)).stdout).toBe("1\n");
    expect((await sandbox.runCase("python", artifact, "b", LIMITS, RUN_ID)).exitCode).toBe(1);
    expect((await sandbox.runCase("python", artifact, "c", LIMITS, RUN_ID)).exitCode).toBe(1);
    expect(sandbox.calls).toEqual({ profiles: 1, prepare: 1, runCase: 3 });
    expect(sandbox.cases.map((call) => [call.source, call.stdin])).toEqual([
      ["print(1)", "a"],
      ["print(1)", "b"],
      ["print(1)", "c"],
    ]);

    expect(await sandbox.failCompilation("SyntaxError").prepare("python", "x", LIMITS, RUN_ID)).toEqual({ ok: false, output: "SyntaxError" });
    sandbox.failDaemon();
    await expect(sandbox.prepare("python", "x", LIMITS, RUN_ID)).rejects.toEqual(new SandboxError("DAEMON_UNAVAILABLE"));
    await expect(sandbox.runCase("python", artifact, "", LIMITS, RUN_ID)).rejects.toBeInstanceOf(SandboxError);
    await expect(sandbox.failDaemon("IMAGE_MISSING").profiles()).rejects.toMatchObject({ code: "IMAGE_MISSING" });
  });
});
