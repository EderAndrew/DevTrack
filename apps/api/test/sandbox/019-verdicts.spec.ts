import { describe, expect, it } from "vitest";
import { LIMITS, runProgram, verdicts } from "./helpers";

/**
 * 019 research B6 end to end: the verdict table with the real containers and limits — time before
 * output, output before memory, memory before a runtime error, a clean exit compared by B7 (stderr
 * doesn't count, trailing spaces and final blank lines are ignored).
 */
const ONE = [{ input: "", expected: "ok\n" }];

describe("019 sandbox real: a tabela de vereditos (research B6)", () => {
  it("019/US1-6 laço infinito → TIME_LIMIT, dentro do limite + 1 s", async () => {
    const result = await runProgram("python", "while True:\n    pass\n", ONE);
    expect(verdicts(result)).toEqual(["TIME_LIMIT"]);
    expect(result.compiled && result.cases[0]!.durationMs).toBeLessThan(LIMITS.timeMs + 2500);
  });

  it("019/US1-6 saída sem fim → OUTPUT_LIMIT, cortada no limite", async () => {
    const result = await runProgram("javascript", "for (;;) process.stdout.write('x'.repeat(1024));\n", ONE);
    expect(verdicts(result)).toEqual(["OUTPUT_LIMIT"]);
    expect(result.compiled && Buffer.byteLength(result.cases[0]!.stdout)).toBeLessThanOrEqual(LIMITS.outputBytes);
  });

  it("019/US1-6 memória sem fim → MEMORY_LIMIT nas três linguagens", async () => {
    const programs = {
      python: "a = []\nwhile True:\n    a.append(bytearray(10_000_000))\n",
      javascript: "const a = [];\nfor (;;) a.push(new Array(1_000_000).fill(1));\n",
      java: "import java.util.*;\npublic class Main { public static void main(String[] x) { List<long[]> a = new ArrayList<>(); while (true) a.add(new long[1_000_000]); } }\n",
    } as const;
    for (const [key, source] of Object.entries(programs)) {
      expect(verdicts(await runProgram(key as keyof typeof programs, source, ONE)), key).toEqual(["MEMORY_LIMIT"]);
    }
  });

  it("019 saída de erro com a saída certa passa; espaços no fim e linhas vazias no fim são ignorados", async () => {
    const result = await runProgram("python", "import sys\nprint('aviso', file=sys.stderr)\nprint('ok   ')\nprint()\nprint()\n", ONE);
    expect(verdicts(result)).toEqual(["PASSED"]);
    expect(result.compiled && result.cases[0]!.stderr).toContain("aviso");
  });

  it("019 diferença de maiúsculas ou de espaço interno não passa", async () => {
    expect(verdicts(await runProgram("python", "print('OK')\n", ONE))).toEqual(["WRONG_OUTPUT"]);
    expect(verdicts(await runProgram("python", "print('o k')\n", ONE))).toEqual(["WRONG_OUTPUT"]);
  });

  it("019 saída de código diferente de zero sem erro → RUNTIME_ERROR", async () => {
    expect(verdicts(await runProgram("javascript", "console.log('ok'); process.exit(3);\n", ONE))).toEqual(["RUNTIME_ERROR"]);
  });
});
