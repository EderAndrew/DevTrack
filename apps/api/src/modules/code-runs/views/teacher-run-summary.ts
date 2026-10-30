import type {
  AttemptCodeRunLastFinished,
  AttemptCodeRunQuestion,
} from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";

/**
 * What the teacher's summary reads of a finished run (021 research Y7): status, counts, verdicts and
 * the time — columns that survive the 24 h purge. Never the source, the compiler message, the outputs
 * or the claim, so the summary is the same before and after it (FR-013).
 */
export const LAST_FINISHED_SELECT = {
  studentUserId: true,
  status: true,
  failureReason: true,
  outcome: true,
  publicCaseCount: true,
  passedCount: true,
  finishedAt: true,
  cases: {
    orderBy: { position: "asc" },
    select: { position: true, verdict: true },
  },
} as const satisfies Prisma.CodeRunSelect;

export type LastFinishedRow = Prisma.CodeRunGetPayload<{
  select: typeof LAST_FINISHED_SELECT;
}>;

/** The only builder of a question's summary (an allowlist copied field by field). */
export function toTeacherRunSummary(
  questionId: string,
  counts: { runCount: number; pending: boolean },
  last: LastFinishedRow | null,
): AttemptCodeRunQuestion {
  return {
    questionId,
    runCount: counts.runCount,
    pending: counts.pending,
    lastFinished: last ? toLastFinished(last) : null,
  };
}

function toLastFinished(row: LastFinishedRow): AttemptCodeRunLastFinished {
  return {
    studentUserId: row.studentUserId,
    status: row.status === "COMPLETED" ? "COMPLETED" : "FAILED",
    failureReason: row.failureReason,
    outcome: row.outcome,
    publicCaseCount: row.publicCaseCount,
    passedCount: row.passedCount,
    finishedAt: row.finishedAt!.toISOString(),
    cases:
      row.outcome === "EXECUTED"
        ? row.cases.map((item) => ({
            position: item.position,
            verdict: item.verdict,
          }))
        : [],
  };
}
