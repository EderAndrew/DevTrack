import type { CodeRun } from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";

/**
 * What a run's student view reads (019 contracts/http-api.md): the run and its cases, never the
 * claim (worker, token, lease), the test case ids or anything of the question's private cases.
 */
export const CODE_RUN_SELECT = {
  id: true,
  questionId: true,
  status: true,
  failureReason: true,
  outcome: true,
  sourceCode: true,
  compileOutput: true,
  publicCaseCount: true,
  passedCount: true,
  createdAt: true,
  finishedAt: true,
  contentPurgedAt: true,
  cases: { orderBy: { position: "asc" }, select: { position: true, verdict: true, stdout: true, stderr: true, durationMs: true } },
} as const satisfies Prisma.CodeRunSelect;

export type CodeRunRow = Prisma.CodeRunGetPayload<{ select: typeof CODE_RUN_SELECT }>;

/**
 * The only builder of a run the student receives (research B17): an allowlist copied field by field.
 * Each case carries its position among the question's PUBLIC cases; the screen joins it with
 * `publicTestCases` for the input and the expected output, which are never copied into the run.
 */
export function toStudentRun(row: CodeRunRow): CodeRun {
  return {
    id: row.id,
    questionId: row.questionId,
    status: row.status,
    failureReason: row.failureReason,
    outcome: row.outcome,
    sourceCode: row.sourceCode,
    compileOutput: row.compileOutput,
    publicCaseCount: row.publicCaseCount,
    passedCount: row.passedCount,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    contentPurged: row.contentPurgedAt !== null,
    cases:
      row.outcome === "EXECUTED"
        ? row.cases.map((item) => ({ position: item.position, verdict: item.verdict, stdout: item.stdout, stderr: item.stderr, durationMs: item.durationMs }))
        : [],
  };
}
