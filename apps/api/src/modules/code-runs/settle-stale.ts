import type { CodeRunFailureReason, CodeRunOutcome } from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import type { Tx } from "../../platform/database/transaction";
import type { AuditService } from "../audit/audit.service";
import { summarizeVerdicts } from "./verdict";

/** Which pending runs a settlement looks at: one student's (the API's touches) or all (the worker). */
export type SettleScope = { studentUserId: string } | "ALL";

interface SettledRow {
  id: string;
  failure_reason: CodeRunFailureReason;
  public_case_count: number;
  created_at: Date;
}

/**
 * Closes the runs that can no longer finish (019 research B8, B10, FR-017), with the caller's server
 * `now`: QUEUED past its queue deadline → FAILED/EXPIRED; RUNNING past its lease (the worker died) →
 * FAILED/INTERRUPTED; and, when the execution is switched off, every QUEUED run → FAILED/DISABLED.
 * One conditional `UPDATE … RETURNING` per reason, so the API and the worker settling at the same
 * time close each run once (the second `UPDATE` re-reads the row and no longer matches), and each
 * closed run gets its one `code_run.finished` (SYSTEM) in the same transaction. A failed run is never
 * executed later: the claim only takes QUEUED runs within their deadline.
 */
export async function settleStaleRuns(
  tx: Tx,
  audit: AuditService,
  options: { now: Date; scope: SettleScope; disabled: boolean },
): Promise<number> {
  const { now, scope, disabled } = options;
  const own = scope === "ALL" ? Prisma.empty : Prisma.sql`AND student_user_id = ${scope.studentUserId}::uuid`;
  const settled = [
    ...(disabled
      ? await tx.$queryRaw<SettledRow[]>`
          UPDATE code_runs SET status = 'FAILED', failure_reason = 'DISABLED', finished_at = ${now}
          WHERE status = 'QUEUED' ${own}
          RETURNING id, failure_reason::text AS failure_reason, public_case_count, created_at`
      : []),
    ...(await tx.$queryRaw<SettledRow[]>`
      UPDATE code_runs SET status = 'FAILED', failure_reason = 'EXPIRED', finished_at = ${now}
      WHERE status = 'QUEUED' AND deadline_at <= ${now} ${own}
      RETURNING id, failure_reason::text AS failure_reason, public_case_count, created_at`),
    ...(await tx.$queryRaw<SettledRow[]>`
      UPDATE code_runs SET status = 'FAILED', failure_reason = 'INTERRUPTED', finished_at = ${now}
      WHERE status = 'RUNNING' AND lease_until <= ${now} ${own}
      RETURNING id, failure_reason::text AS failure_reason, public_case_count, created_at`),
  ];
  for (const row of settled) {
    await recordFinished(tx, audit, {
      runId: row.id,
      status: "FAILED",
      outcome: null,
      failureReason: row.failure_reason,
      passedCount: null,
      publicCaseCount: row.public_case_count,
      durationMs: Math.max(0, now.getTime() - row.created_at.getTime()),
      verdicts: summarizeVerdicts([]).verdicts,
    });
  }
  return settled.length;
}

/** `code_run.finished` (contracts/audit-events.md): written once, by whoever makes the run final. */
export function recordFinished(
  tx: Tx,
  audit: AuditService,
  run: {
    runId: string;
    status: "COMPLETED" | "FAILED";
    outcome: CodeRunOutcome | null;
    failureReason: CodeRunFailureReason | null;
    passedCount: number | null;
    publicCaseCount: number;
    durationMs: number;
    verdicts: Record<string, number>;
  },
): Promise<void> {
  const { runId, ...metadata } = run;
  return audit.record(tx, { type: "code_run.finished", actorType: "SYSTEM", targetType: "CODE_RUN", targetId: runId, requestId: null, metadata });
}
