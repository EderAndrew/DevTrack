import type { Tx } from "../../../platform/database/transaction";
import type { AuditService } from "../../audit/audit.service";

/**
 * Marks FAILED, once, the pending requests of an attempt whose execution ended without completing
 * (015 research F11): FAILED, CANCELLED (e.g. the agent disabled) or TIMED_OUT, with the execution's
 * error code. A conditional UPDATE, so two concurrent reads reconcile and audit each request once.
 * Nothing is consumed: only DELIVERED counts.
 */
export async function reconcileHelpRequests(tx: Tx, audit: AuditService, attemptId: string, now: Date): Promise<void> {
  const failed = await tx.$queryRaw<{ id: string; ai_execution_id: string; reason_code: string }[]>`
    UPDATE work_help_requests r
    SET status = 'FAILED',
        reason_code = COALESCE(e.error_code, CASE e.status WHEN 'CANCELLED' THEN 'AI_EXECUTION_CANCELLED' WHEN 'TIMED_OUT' THEN 'AI_TIMEOUT' ELSE 'AI_PROVIDER_ERROR' END),
        resolved_at = ${now}
    FROM ai_executions e
    WHERE r.attempt_id = ${attemptId}::uuid
      AND r.status = 'REQUESTED'
      AND e.id = r.ai_execution_id
      AND e.status IN ('FAILED', 'CANCELLED', 'TIMED_OUT')
    RETURNING r.id, r.ai_execution_id, r.reason_code`;
  for (const row of failed) {
    await audit.record(tx, {
      type: "work_help.failed",
      actorType: "SYSTEM",
      targetType: "WORK_HELP_REQUEST",
      targetId: row.id,
      metadata: { attemptId, executionId: row.ai_execution_id, errorCode: row.reason_code },
    });
  }
}
