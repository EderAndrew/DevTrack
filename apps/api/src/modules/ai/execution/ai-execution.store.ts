import { Injectable } from "@nestjs/common";
import type { AiErrorCode, AiExecutionStatus } from "@repo/contracts";
import type { AiExecutionStep } from "../../../generated/prisma/client";
import type { Tx } from "../../../platform/database/transaction";
import { AuditService } from "../../audit/audit.service";
import { AiExecutionStateMachine } from "./ai-execution.state-machine";

export interface FinishRequest {
  executionId: string;
  /** The status must still be one of these (and valid per the state machine). */
  from: readonly AiExecutionStatus[];
  to: Extract<AiExecutionStatus, "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT">;
  errorCode: AiErrorCode | null;
  now: Date;
  /** The worker's claim; `null` for writes outside a claim (request-time cancel, deadline sweep). */
  claimToken: string | null;
  /** Only while no cancellation was asked (a late result is discarded, FR-027). */
  requireNoCancel?: boolean;
  actor: { type: "USER"; userId: string; requestId: string | null } | { type: "SYSTEM" };
  proposalId?: string | null;
}

export interface FinishedExecution {
  fromStatus: AiExecutionStatus;
  durationMs: number;
  modelCalls: number;
  toolCalls: number;
}

/**
 * Status writes of an execution, all conditional (006 FR-021, FR-024, research A6, A8): the row
 * must still be in the expected status and, for the worker, under the same claim; otherwise
 * nothing changes and `null` comes back. Each change writes its transition row, and the final
 * ones their audit event, in the caller's transaction.
 */
@Injectable()
export class AiExecutionStore {
  constructor(private readonly audit: AuditService) {}

  /** A non-final move (RUNNING ⇄ WAITING_TOOL, → VALIDATING_OUTPUT) under the claim. */
  async move(
    tx: Tx,
    executionId: string,
    claimToken: string,
    from: AiExecutionStatus,
    to: AiExecutionStatus,
    now: Date,
    step: AiExecutionStep | null,
  ): Promise<boolean> {
    AiExecutionStateMachine.assertTransition(from, to);
    const { count } = await tx.aiExecution.updateMany({
      where: { id: executionId, claimToken, status: from, cancelRequestedAt: null },
      data: { status: to, step },
    });
    if (count === 0) return false;
    await tx.aiExecutionTransition.create({ data: { executionId, fromStatus: from, toStatus: to, occurredAt: now } });
    return true;
  }

  async setStep(tx: Tx, executionId: string, claimToken: string, step: AiExecutionStep): Promise<void> {
    await tx.aiExecution.updateMany({ where: { id: executionId, claimToken }, data: { step } });
  }

  async finish(tx: Tx, request: FinishRequest): Promise<FinishedExecution | null> {
    const allowed = request.from.filter((status) => AiExecutionStateMachine.canTransition(status, request.to));
    if (allowed.length === 0) return null;
    const rows = await tx.$queryRaw<{ from_status: AiExecutionStatus; duration_ms: number; model_calls: number; tool_calls: number }[]>`
      WITH prev AS (
        SELECT id, status FROM ai_executions WHERE id = ${request.executionId}::uuid FOR UPDATE
      )
      UPDATE ai_executions e
      SET status = ${request.to}::ai_execution_status,
          error_code = ${request.errorCode},
          step = NULL,
          lease_expires_at = NULL,
          finished_at = ${request.now}::timestamptz,
          duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (${request.now}::timestamptz - e.created_at)) * 1000)::int)
      FROM prev
      WHERE e.id = prev.id
        AND e.status = ANY(${allowed}::text[]::ai_execution_status[])
        AND (${request.claimToken}::uuid IS NULL OR e.claim_token = ${request.claimToken}::uuid)
        AND (${request.requireNoCancel ?? false} = false OR e.cancel_requested_at IS NULL)
      RETURNING prev.status AS from_status, e.duration_ms, e.model_calls, e.tool_calls`;
    const row = rows[0];
    if (!row) return null;

    await tx.aiExecutionTransition.create({
      data: { executionId: request.executionId, fromStatus: row.from_status, toStatus: request.to, occurredAt: request.now },
    });
    const actor =
      request.actor.type === "USER"
        ? { actorType: "USER" as const, actorUserId: request.actor.userId, requestId: request.actor.requestId }
        : { actorType: "SYSTEM" as const };
    const target = { targetType: "AI_EXECUTION" as const, targetId: request.executionId };
    if (request.to === "COMPLETED") {
      await this.audit.record(tx, {
        type: "ai_execution.completed",
        ...actor,
        ...target,
        metadata: { durationMs: row.duration_ms, modelCalls: row.model_calls, toolCalls: row.tool_calls, proposalId: request.proposalId ?? null },
      });
    } else if (request.to === "CANCELLED") {
      await this.audit.record(tx, { type: "ai_execution.cancelled", ...actor, ...target, metadata: { from: row.from_status, errorCode: request.errorCode } });
    } else {
      await this.audit.record(tx, {
        type: "ai_execution.failed",
        ...actor,
        ...target,
        metadata: { status: request.to, errorCode: request.errorCode, durationMs: row.duration_ms, modelCalls: row.model_calls, toolCalls: row.tool_calls },
      });
    }
    return { fromStatus: row.from_status, durationMs: row.duration_ms, modelCalls: row.model_calls, toolCalls: row.tool_calls };
  }
}
