import type { ExecutionKey } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { runProgram, verdicts } from "./helpers";

/**
 * 019/SC-001 against the real `DockerSandbox` (research B4 spike): a simple program with 5 public cases
 * shows its result within 5 s (Python/JavaScript) and 10 s (Java) in 95% of the runs, with no queue;
 * 40 runs arriving together, served by 4 slots, end within 30 s for 95% of them. Measured as the
 * worker does a run: the check/compile step, then each case in a fresh container. gVisor adds to the
 * start-up and is checked by the deploy checklist with these same numbers.
 */
const CASES = [1, 2, 3, 4, 5].map((n) => ({ input: `${n}\n`, expected: `${n * 2}\n` }));

const PROGRAMS: Record<ExecutionKey, string> = {
  python: "print(int(input()) * 2)\n",
  javascript: "console.log(Number(require('fs').readFileSync(0, 'utf8').trim()) * 2);\n",
  java: "public class Main { public static void main(String[] a) { System.out.println(new java.util.Scanner(System.in).nextInt() * 2); } }\n",
};

const BUDGET_MS: Record<ExecutionKey, number> = { python: 5000, javascript: 5000, java: 10_000 };

/** The 95th percentile (nearest rank). */
function p95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

async function timedRun(key: ExecutionKey): Promise<number> {
  const startedAt = performance.now();
  const result = await runProgram(key, PROGRAMS[key], CASES);
  const elapsed = performance.now() - startedAt;
  expect(verdicts(result), key).toEqual(["PASSED", "PASSED", "PASSED", "PASSED", "PASSED"]);
  return elapsed;
}

describe("019/SC-001 tempo de uma execução de 5 casos", () => {
  it.each(["python", "javascript", "java"] as const)("019/SC-001 %s: p95 de 20 execuções sem fila dentro do orçamento", async (key) => {
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) durations.push(await timedRun(key));
    expect(p95(durations)).toBeLessThanOrEqual(BUDGET_MS[key]);
  });

  it("019/SC-001 40 execuções chegando juntas, 4 vagas: 95% terminam em até 30 s", async () => {
    const keys = Array.from({ length: 40 }, (_, index) => (["python", "javascript", "java"] as const)[index % 3]!);
    const startedAt = performance.now();
    const doneAt: number[] = [];
    let next = 0;
    const slot = async () => {
      while (next < keys.length) {
        const key = keys[next]!;
        next += 1;
        await timedRun(key);
        doneAt.push(performance.now() - startedAt);
      }
    };
    await Promise.all([slot(), slot(), slot(), slot()]);
    expect(doneAt).toHaveLength(40);
    expect(p95(doneAt)).toBeLessThanOrEqual(30_000);
  });
});
