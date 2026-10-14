import { type CodeRunVerdict, CodeRunVerdictSchema } from "@repo/contracts";
import { outputsMatch } from "./compare-output";

/** What the sandbox reports of one case (contracts/sandbox.md `runCase`), minus the duration. */
export interface CaseExecution {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Killed by the time limit: the in-container `timeout` or the worker's timer. */
  timedOut: boolean;
  /** stdout passed the output limit; the worker killed the container. */
  outputExceeded: boolean;
  /** The container's `OOMKilled`. */
  oomKilled: boolean;
}

/** The runtimes' own words for running out of memory (Java, Node.js, Python), read from stderr only. */
const OUT_OF_MEMORY = [/java\.lang\.OutOfMemoryError/, /JavaScript heap out of memory/, /^MemoryError\b/m];

/**
 * One case's verdict (019 research B6), in this order: time, output, memory, any other non-zero exit,
 * then the output comparison (B7). Deterministic; the sandbox only reports facts.
 */
export function caseVerdict(execution: CaseExecution, expectedOutput: string): CodeRunVerdict {
  if (execution.timedOut) return "TIME_LIMIT";
  if (execution.outputExceeded) return "OUTPUT_LIMIT";
  if (execution.oomKilled || execution.exitCode === 137) return "MEMORY_LIMIT";
  if (execution.exitCode !== 0 && OUT_OF_MEMORY.some((pattern) => pattern.test(execution.stderr))) return "MEMORY_LIMIT";
  if (execution.exitCode !== 0) return "RUNTIME_ERROR";
  return outputsMatch(execution.stdout, expectedOutput) ? "PASSED" : "WRONG_OUTPUT";
}

/** The run's `passedCount` and the count per verdict (the `code_run.finished` audit metadata). */
export function summarizeVerdicts(verdicts: readonly CodeRunVerdict[]): { passedCount: number; verdicts: Record<CodeRunVerdict, number> } {
  const counts = Object.fromEntries(CodeRunVerdictSchema.options.map((verdict) => [verdict, 0])) as Record<CodeRunVerdict, number>;
  for (const verdict of verdicts) counts[verdict] += 1;
  return { passedCount: counts.PASSED, verdicts: counts };
}
