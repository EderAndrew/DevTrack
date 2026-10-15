import type { CodeRunVerdict, ExecutionKey } from "@repo/contracts";
import { DockerSandbox } from "../../src/code-runner/sandbox/docker-sandbox";
import type { CaseResult, SandboxLimits } from "../../src/code-runner/sandbox/sandbox.port";
import { caseVerdict } from "../../src/modules/code-runs/verdict";

/** The defaults of contracts/configuration.md: what a student run gets. */
export const LIMITS: SandboxLimits = { timeMs: 2000, compileMs: 10_000, memoryMb: 256, outputBytes: 65_536, pidsLimit: 128 };

export const sandbox = new DockerSandbox("runc");

export type ProgramResult =
  | { compiled: false; output: string }
  | { compiled: true; cases: (CaseResult & { verdict: CodeRunVerdict })[] };

/** A whole run, as the worker does it: check/compile once, then each case in a fresh container. */
export async function runProgram(key: ExecutionKey, source: string, cases: { input: string; expected: string }[], limits = LIMITS): Promise<ProgramResult> {
  const runId = crypto.randomUUID();
  try {
    const prepared = await sandbox.prepare(key, source, limits, runId);
    if (!prepared.ok) return { compiled: false, output: prepared.output };
    const results: (CaseResult & { verdict: CodeRunVerdict })[] = [];
    for (const testCase of cases) {
      const result = await sandbox.runCase(key, prepared.artifact, testCase.input, limits, runId);
      results.push({ ...result, verdict: caseVerdict(result, testCase.expected) });
    }
    return { compiled: true, cases: results };
  } finally {
    await sandbox.cleanup(runId);
  }
}

/** The verdicts of a compiled run (fails the test on a compilation error). */
export function verdicts(result: ProgramResult): CodeRunVerdict[] {
  if (!result.compiled) throw new Error(`não compilou: ${result.output}`);
  return result.cases.map((item) => item.verdict);
}
