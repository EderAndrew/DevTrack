import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { leftoverContainers, LIMITS, runProgram, verdicts } from "./helpers";

/**
 * 019/US3-1…US3-3, FR-013, SC-003 against the real `DockerSandbox` (`pnpm --filter api test:sandbox`):
 * the student's program is hostile. Each attack ends in a known result within the limits — no network
 * (not the host, not the database, not DNS), nothing of the platform visible (files, environment),
 * no write outside the 32 MB `/tmp`, processes capped by `--pids-limit`, time, memory and output caps
 * — without touching the worker, and after each one a normal run still passes and no labelled
 * container is left behind.
 */
const ONE = [{ input: "", expected: "ok\n" }];
/** A secret of the worker's own environment: the student's container never sees it. */
const WORKER_SECRET = "MARCADOR-SEGREDO-WORKER-019";

/** A normal run right after an attack: the sandbox is unharmed. */
async function stillWorks(): Promise<void> {
  const result = await runProgram("python", "print(int(input()) * 2)\n", [{ input: "21\n", expected: "42\n" }]);
  expect(verdicts(result)).toEqual(["PASSED"]);
}

describe("019/SC-003 suíte hostil: o código do aluno não sai da caixa", () => {
  beforeAll(() => {
    process.env.DEVTRACK_WORKER_SECRET = WORKER_SECRET;
  });

  afterEach(async () => {
    await stillWorks();
    expect(await leftoverContainers()).toEqual([]);
  });

  it("019/US3-1 019/FR-013 rede: TCP para o host e para o banco, e DNS, falham nas três linguagens", async () => {
    const python = [
      "import socket",
      "for host, port in [('host.docker.internal', 5432), ('host.docker.internal', 5433), ('172.17.0.1', 5432), ('1.1.1.1', 53)]:",
      "    try:",
      "        socket.create_connection((host, port), timeout=1)",
      "        print('conectou', host, port)",
      "    except OSError:",
      "        pass",
      "try:",
      "    socket.gethostbyname('example.com')",
      "    print('dns')",
      "except OSError:",
      "    pass",
      "print('ok')",
    ].join("\n");
    const javascript = [
      "const net = require('net'); const dns = require('dns');",
      "const tries = [['1.1.1.1', 53], ['172.17.0.1', 5432]].map(([host, port]) => new Promise((done) => {",
      "  const s = net.connect({ host, port, timeout: 1000 }, () => { console.log('conectou', host); s.destroy(); done(); });",
      "  s.on('error', () => done()); s.on('timeout', () => { s.destroy(); done(); });",
      "}));",
      "tries.push(new Promise((done) => dns.lookup('example.com', (err) => { if (!err) console.log('dns'); done(); })));",
      "Promise.all(tries).then(() => console.log('ok'));",
    ].join("\n");
    const java = [
      "public class Main {",
      "  public static void main(String[] a) {",
      "    try (java.net.Socket s = new java.net.Socket()) { s.connect(new java.net.InetSocketAddress(\"1.1.1.1\", 53), 1000); System.out.println(\"conectou\"); }",
      "    catch (Exception e) { }",
      "    try { java.net.InetAddress.getByName(\"example.com\"); System.out.println(\"dns\"); } catch (Exception e) { }",
      "    System.out.println(\"ok\");",
      "  }",
      "}",
    ].join("\n");
    for (const [key, source] of [["python", python], ["javascript", javascript], ["java", java]] as const) {
      const result = await runProgram(key, source, ONE);
      expect(verdicts(result), `${key}: ${result.compiled && result.cases[0]!.stdout}`).toEqual(["PASSED"]);
    }
  });

  it("019/US3-2 019/FR-013 nada da plataforma: /etc/passwd do container, ambiente sem variáveis do worker, sem segredos", async () => {
    const result = await runProgram(
      "python",
      [
        "import os",
        "print(open('/etc/passwd').read())",
        "print('\\n'.join(f'{k}={v}' for k, v in sorted(os.environ.items())))",
        "print(os.listdir('/'))",
        "print(os.getuid(), os.getgid())",
      ].join("\n"),
      ONE,
    );
    expect(result.compiled).toBe(true);
    const stdout = result.compiled ? result.cases[0]!.stdout : "";
    expect(stdout).toContain("root:x:0:0"); // the image's own file, not the host's
    expect(stdout).toContain("65534 65534"); // the unprivileged user
    for (const leaked of [WORKER_SECRET, "DATABASE_URL", "APP_HMAC_SECRET", "OPENROUTER", "MAIL_", "DOCKER_HOST", "CODE_RUNNER", "devtrack", process.env.HOME ?? "/Users"]) {
      expect(stdout, leaked).not.toContain(leaked);
    }
    // The other profiles see the same nothing.
    const node = await runProgram("javascript", "console.log(JSON.stringify(process.env));\n", ONE);
    expect(node.compiled && node.cases[0]!.stdout).not.toMatch(new RegExp(`${WORKER_SECRET}|DATABASE_URL|APP_HMAC_SECRET`));
  });

  it("019/US3-3 escrita fora de /tmp é recusada; encher /tmp para em 32 MB", async () => {
    const outside = await runProgram(
      "python",
      [
        "import os",
        "for path in ['/x', '/etc/x', '/home/x', '/usr/x', os.path.expanduser('~/x')]:",
        "    try:",
        "        open(path, 'w').write('x')",
        "        print('escreveu', path)",
        "    except OSError:",
        "        pass",
        "print('ok')",
      ].join("\n"),
      ONE,
    );
    expect(verdicts(outside)).toEqual(["PASSED"]);

    const fill = await runProgram(
      "python",
      [
        "total = 0",
        "try:",
        "    with open('/tmp/enche', 'wb') as f:",
        "        while total < 200 * 1024 * 1024:",
        "            f.write(b'x' * 1048576)",
        "            f.flush()",
        "            total += 1048576",
        "except OSError:",
        "    pass",
        "print('ok' if total <= 32 * 1048576 else total)",
      ].join("\n"),
      ONE,
    );
    // Stopped by the tmpfs size (ENOSPC) or by the file-size ulimit (SIGXFSZ): never past 32 MB.
    expect(verdicts(fill)[0], fill.compiled ? fill.cases[0]!.stdout + fill.cases[0]!.stderr : "").toMatch(/^(PASSED|RUNTIME_ERROR)$/);
    if (fill.compiled && fill.cases[0]!.verdict === "PASSED") expect(fill.cases[0]!.stdout).toBe("ok\n");
  });

  it("019/US3-3 fork bomb contida pelo pids-limit, dentro do tempo", async () => {
    const python = await runProgram("python", "import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass\n", ONE);
    expect(verdicts(python)[0]).toMatch(/^(TIME_LIMIT|RUNTIME_ERROR|MEMORY_LIMIT)$/);
    expect(python.compiled && python.cases[0]!.durationMs).toBeLessThan(LIMITS.timeMs + 1000 + 1500);

    const node = await runProgram(
      "javascript",
      "const { spawn } = require('child_process');\nfor (;;) { try { spawn('sleep', ['100']); } catch (e) {} }\n",
      ONE,
    );
    expect(verdicts(node)[0]).toMatch(/^(TIME_LIMIT|RUNTIME_ERROR|MEMORY_LIMIT)$/);
  });

  it("019/US3-3 laço infinito → TIME_LIMIT dentro do limite + 1 s, nas três linguagens", async () => {
    const programs = {
      python: "while True:\n    pass\n",
      javascript: "for (;;) {}\n",
      java: "public class Main { public static void main(String[] a) { while (true) { } } }\n",
    } as const;
    for (const [key, source] of Object.entries(programs) as [keyof typeof programs, string][]) {
      const result = await runProgram(key, source, ONE);
      expect(verdicts(result), key).toEqual(["TIME_LIMIT"]);
      // The container's own start-up counts too: the worker's timer kills at limit + 1 s.
      expect(result.compiled && result.cases[0]!.durationMs, key).toBeLessThan(LIMITS.timeMs + 1000 + 500);
    }
  });

  it("019/US3-3 alocação sem fim → MEMORY_LIMIT", async () => {
    expect(verdicts(await runProgram("python", "a = []\nwhile True:\n    a.append(bytearray(50_000_000))\n", ONE))).toEqual(["MEMORY_LIMIT"]);
    expect(verdicts(await runProgram("javascript", "const a = [];\nfor (;;) a.push(Buffer.alloc(50_000_000, 1));\n", ONE))).toEqual(["MEMORY_LIMIT"]);
  });

  it("019/US3-3 10 MB de saída → OUTPUT_LIMIT, cortada no limite", async () => {
    for (const [key, source] of [
      ["python", "import sys\nsys.stdout.write('x' * 10_000_000)\n"],
      ["javascript", "process.stdout.write('x'.repeat(10_000_000));\n"],
    ] as const) {
      const result = await runProgram(key, source, ONE);
      expect(verdicts(result), key).toEqual(["OUTPUT_LIMIT"]);
      expect(result.compiled && Buffer.byteLength(result.cases[0]!.stdout)).toBeLessThanOrEqual(LIMITS.outputBytes);
    }
  });

  it("019/US3-3 kill -9 -1 dentro do container não afeta o worker", async () => {
    const before = process.pid;
    const result = await runProgram("python", "import os, signal\nos.kill(-1, signal.SIGKILL)\nprint('ok')\n", ONE);
    expect(result.compiled).toBe(true);
    expect(["PASSED", "RUNTIME_ERROR", "TIME_LIMIT", "MEMORY_LIMIT"]).toContain(verdicts(result)[0]);
    expect(process.pid).toBe(before);
  });
});
