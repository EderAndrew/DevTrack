import { Injectable, Logger } from "@nestjs/common";
import type { AiErrorCode } from "@repo/contracts";
import { PrismaService } from "../../../platform/database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type { AiExecutionContext, ModelToolCall, ToolContext } from "../definitions/types";
import { aiLog } from "../execution/ai-log";
import { AiResourceResolver } from "../execution/ai-resource.resolver";
import { AiToolRegistry } from "../registry/ai-tool.registry";

export type ToolCallStatus = "DENIED" | "FAILED" | "TIMED_OUT";

export type ToolCallOutcome =
  | { ok: true; result: unknown }
  | { ok: false; status: ToolCallStatus; code: AiErrorCode; reason?: "INVALID_ARGUMENTS" | "INVALID_OUTPUT" };

/** A model-chosen key is recorded as given, but never longer than a registry key. */
const MAX_KEY = 63;

class Refused {
  constructor(
    readonly status: ToolCallStatus,
    readonly code: AiErrorCode,
    readonly reason?: "INVALID_ARGUMENTS" | "INVALID_OUTPUT",
  ) {}
}

/**
 * Runs one tool call of the model (006 FR-033–FR-038, research A14), deny by default, checking in
 * this order and stopping at the first refusal:
 *   1. the tool is in the allowlist of the agent version (unknown keys included) — AI_TOOL_NOT_ALLOWED;
 *   2. the tool is enabled — AI_TOOL_NOT_ALLOWED;
 *   3. the execution's user holds the tool's permission — AI_CONTEXT_ACCESS_DENIED;
 *   4. the arguments pass the tool's strict schema, before any data access — AI_TOOL_EXECUTION_FAILED;
 *   5. the resource exists in the execution's workspace — AI_CONTEXT_ACCESS_DENIED;
 *   6. `run` under the tool timeout, the execution deadline and the cancellation — TIMED_OUT;
 *   7. the result passes the tool's strict output schema (minimal fields) — AI_TOOL_EXECUTION_FAILED.
 * Each call writes `ai_tool_calls` (never the arguments nor the result, FR-037) and its audit event
 * in a short transaction. The result goes back to the model only as untrusted content.
 */
@Injectable()
export class AiToolExecutor {
  private readonly logger = new Logger("AiTool");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tools: AiToolRegistry,
    private readonly resources: AiResourceResolver,
  ) {}

  async call(ctx: AiExecutionContext, request: ModelToolCall, sequence: number, limits: { toolTimeoutMs: number }): Promise<ToolCallOutcome> {
    const startedAt = new Date();
    const toolKey = String(request.toolKey).slice(0, MAX_KEY);
    let toolId: string | null = null;
    let outcome: ToolCallOutcome;
    try {
      if (!ctx.allowedToolKeys.includes(toolKey)) throw new Refused("DENIED", "AI_TOOL_NOT_ALLOWED");
      const tool = await this.tools.byKey(toolKey);
      if (!tool) throw new Refused("DENIED", "AI_TOOL_NOT_ALLOWED");
      toolId = tool.id;
      if (!tool.enabled) throw new Refused("DENIED", "AI_TOOL_NOT_ALLOWED");
      const definition = tool.definition;
      if (!ctx.permissions.includes(definition.requiredPermission)) throw new Refused("DENIED", "AI_CONTEXT_ACCESS_DENIED");

      const input = definition.inputSchema.safeParse(request.arguments);
      if (!input.success) throw new Refused("DENIED", "AI_TOOL_EXECUTION_FAILED", "INVALID_ARGUMENTS");

      const resource = { type: definition.resourceType, id: definition.resourceIdOf(input.data) };
      if ((await this.resources.owns(ctx.workspaceId, [definition.resourceType], resource)) !== "owned") {
        throw new Refused("DENIED", "AI_CONTEXT_ACCESS_DENIED");
      }

      const result = await this.runBounded(ctx, Math.min(definition.timeoutMs, limits.toolTimeoutMs), (signal) =>
        definition.run(this.toolContext(ctx, signal), input.data),
      );
      const output = definition.outputSchema.safeParse(result);
      if (!output.success) throw new Refused("FAILED", "AI_TOOL_EXECUTION_FAILED", "INVALID_OUTPUT");
      outcome = { ok: true, result: output.data };
    } catch (error) {
      if (error instanceof Refused) outcome = { ok: false, status: error.status, code: error.code, ...(error.reason ? { reason: error.reason } : {}) };
      else {
        aiLog(this.logger, "ai.tool_error", { executionId: ctx.executionId, correlationId: ctx.correlationId, toolKey, errorName: error instanceof Error ? error.name : "unknown" }, "warn");
        outcome = { ok: false, status: "FAILED", code: "AI_TOOL_EXECUTION_FAILED" };
      }
    }
    await this.record(ctx, { toolKey, toolId, sequence, startedAt, outcome });
    return outcome;
  }

  /** Only what the contract allows a tool to see (FR-036): no permissions, no model output. */
  private toolContext(ctx: AiExecutionContext, signal: AbortSignal): ToolContext {
    return {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      executionId: ctx.executionId,
      correlationId: ctx.correlationId,
      signal,
      db: this.prisma,
    };
  }

  /** `run` raced against the tool timeout, the execution deadline and the cancellation. */
  private async runBounded<T>(ctx: AiExecutionContext, timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const untilDeadline = Math.max(0, ctx.deadline.getTime() - Date.now());
    const timeout = AbortSignal.timeout(Math.min(timeoutMs, untilDeadline));
    const signal = AbortSignal.any([timeout, ctx.signal]);
    if (signal.aborted) throw this.abortReason(ctx);
    let onAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(this.abortReason(ctx));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([run(signal), aborted]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  private abortReason(ctx: AiExecutionContext): Refused {
    return ctx.signal.aborted ? new Refused("FAILED", "AI_EXECUTION_CANCELLED") : new Refused("TIMED_OUT", "AI_TIMEOUT");
  }

  private async record(
    ctx: AiExecutionContext,
    call: { toolKey: string; toolId: string | null; sequence: number; startedAt: Date; outcome: ToolCallOutcome },
  ): Promise<void> {
    const completedAt = new Date();
    const durationMs = Math.max(0, completedAt.getTime() - call.startedAt.getTime());
    const status = call.outcome.ok ? "SUCCEEDED" : call.outcome.status;
    const errorCode = call.outcome.ok ? null : call.outcome.code;
    await this.prisma.runInTransaction(async (tx) => {
      await tx.aiToolCall.create({
        data: {
          executionId: ctx.executionId,
          sequence: call.sequence,
          toolKey: call.toolKey,
          toolId: call.toolId,
          status,
          errorCode,
          startedAt: call.startedAt,
          completedAt,
          durationMs,
        },
      });
      await tx.aiExecution.update({ where: { id: ctx.executionId }, data: { toolCalls: { increment: 1 } } });
      const target = { actorType: "SYSTEM" as const, targetType: "AI_EXECUTION" as const, targetId: ctx.executionId };
      if (call.outcome.ok) {
        await this.audit.record(tx, { type: "ai_tool.called", ...target, metadata: { toolKey: call.toolKey, sequence: call.sequence, durationMs } });
      } else {
        await this.audit.record(tx, {
          type: "ai_tool.failed",
          ...target,
          metadata: { toolKey: call.toolKey, sequence: call.sequence, status: call.outcome.status, errorCode: call.outcome.code },
        });
      }
    });
    aiLog(this.logger, "ai.tool_call", { executionId: ctx.executionId, correlationId: ctx.correlationId, toolKey: call.toolKey, status, errorCode: errorCode ?? undefined, durationMs });
  }
}
