import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AiErrorCode } from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { PrismaService } from "../../../platform/database/prisma.service";
import { PermissionResolver } from "../../access-control/permission-resolver";
import { AuditService } from "../../audit/audit.service";
import {
  AI_DEFINITIONS,
  type AgentDefinition,
  type AiDefinitions,
  type AiExecutionContext,
  type ModelHistoryEntry,
  type ModelResponse,
  type ModelToolSpec,
  type UntrustedContent,
} from "../definitions/types";
import { ModelGateway } from "../gateway/model-gateway";
import { AiFailure } from "../gateway/provider-errors";
import { StructuredOutputValidator } from "../output/structured-output.validator";
import { jsonSchemaOf } from "../registry/ai-definitions.check";
import { AiModelConfigRegistry, type RegisteredModelConfig } from "../registry/ai-model-config.registry";
import { AiToolExecutor, type ToolCallOutcome } from "../tools/ai-tool-executor";
import { AiUsageRecorder } from "../usage/ai-usage.recorder";
import { AiExecutionAborts } from "./ai-execution-aborts";
import { createExecutionContext } from "./ai-execution-context";
import { AiExecutionStore } from "./ai-execution.store";
import { aiLog } from "./ai-log";
import { effectiveLimits } from "./ai-limits";
import { AiResourceResolver } from "./ai-resource.resolver";
import { buildEnvelope } from "./prompt-envelope";

/** An execution as claimed by the worker. */
export interface ClaimedExecution {
  id: string;
  claimToken: string;
}

type Loaded = Prisma.AiExecutionGetPayload<{
  include: { agentVersionRef: { include: { agent: true; tools: { include: { tool: true } } } } };
}>;

/** Ends the run with a final status (a controlled stop, not an error of the runner). */
class Stop {
  constructor(
    readonly to: "FAILED" | "CANCELLED" | "TIMED_OUT",
    readonly code: AiErrorCode,
  ) {}
}

const RUNNING_STATES = ["RUNNING", "WAITING_TOOL", "VALIDATING_OUTPUT"] as const;

/**
 * Runs one claimed execution (006 US1, contracts/agent-runtime.md "Execution cycle"):
 * re-authorizes against the database, freezes the context, calls the model through the gateway,
 * validates the output and completes in one transaction — every write conditional on the claim,
 * and the completion also on no cancellation, so a late or duplicate writer changes nothing.
 * Loop limits (US6) plug into this cycle.
 */
@Injectable()
export class AiExecutionRunner {
  private readonly logger = new Logger("AiExecution");

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionResolver,
    private readonly modelConfigs: AiModelConfigRegistry,
    private readonly gateway: ModelGateway,
    private readonly validator: StructuredOutputValidator,
    private readonly usage: AiUsageRecorder,
    private readonly store: AiExecutionStore,
    private readonly aborts: AiExecutionAborts,
    private readonly resources: AiResourceResolver,
    private readonly toolExecutor: AiToolExecutor,
    private readonly audit: AuditService,
  ) {}

  async run(claimed: ClaimedExecution): Promise<void> {
    const signal = this.aborts.register(claimed.id);
    const execution = await this.prisma.aiExecution.findUniqueOrThrow({
      where: { id: claimed.id },
      include: { agentVersionRef: { include: { agent: true, tools: { include: { tool: true } } } } },
    });
    try {
      await this.cycle(claimed, execution, signal);
    } catch (error) {
      const stop =
        error instanceof Stop
          ? error
          : error instanceof AiFailure
            ? this.stopFor(error.code)
            : (this.logUnexpected(execution, error), new Stop("FAILED", "AI_PROVIDER_ERROR"));
      await this.end(claimed, execution, stop);
    } finally {
      this.aborts.release(claimed.id);
    }
  }

  private async cycle(claimed: ClaimedExecution, execution: Loaded, signal: AbortSignal): Promise<void> {
    const definition = this.definitions.agents.find((agent) => agent.key === execution.agentKey);
    if (!definition || definition.version !== execution.agentVersion) throw new Stop("FAILED", "AI_AGENT_NOT_FOUND");
    const { config, context } = await this.reauthorize(execution, definition, signal);
    const limits = effectiveLimits(this.config.ai.limits, definition);
    await this.checkCancel(claimed);

    const text = await this.converse(claimed, execution, definition, config, context, limits, signal);
    await this.checkCancel(claimed);

    const moved = await this.prisma.runInTransaction((tx) =>
      this.store.move(tx, claimed.id, claimed.claimToken, "RUNNING", "VALIDATING_OUTPUT", new Date(), "OUTPUT_VALIDATION"),
    );
    if (!moved) return this.lost(claimed, execution);
    if (!definition.output) throw new Stop("FAILED", "AI_OUTPUT_VALIDATION_FAILED");
    const validation = this.validator.validate(text, definition.output.schema, limits.maxOutputBytes);
    if (!validation.ok) {
      aiLog(this.logger, "ai.output_invalid", { ...this.logBase(execution), errorCode: validation.code, issuePaths: validation.issues.map((i) => i.path) }, "warn");
      throw new Stop("FAILED", validation.code);
    }
    await this.complete(claimed, execution, definition, validation.output);
  }

  /**
   * The model ⇄ tools loop (FR-033–FR-035, contracts/agent-runtime.md step b): each tool call of
   * the model goes through `AiToolExecutor` in WAITING_TOOL and its result comes back as untrusted
   * content. A denied call ends the execution unless the agent says `onToolDenied: "continue"`; a
   * tool that fails (e.g. returns undeclared fields) ends it; a tool timeout goes back to the model.
   */
  private async converse(
    claimed: ClaimedExecution,
    execution: Loaded,
    definition: AgentDefinition,
    config: RegisteredModelConfig,
    context: AiExecutionContext,
    limits: ReturnType<typeof effectiveLimits>,
    signal: AbortSignal,
  ): Promise<string> {
    const history: ModelHistoryEntry[] = [];
    const tools = this.toolSpecs(execution);
    let modelCalls = 0;
    let toolCalls = 0;
    for (;;) {
      if (modelCalls >= limits.maxModelCalls) throw new Stop("FAILED", "AI_EXECUTION_LIMIT_EXCEEDED");
      const request = buildEnvelope({
        systemInstructions: definition.prompt.systemInstructions,
        context: definition.buildContext?.(context) ?? {},
        untrusted: untrustedInput(execution.input),
        tools,
        history,
      });
      await this.store.setStep(this.prisma, claimed.id, claimed.claimToken, "MODEL_CALL");
      modelCalls += 1;
      const response = await this.callModel(claimed, execution, config, limits, request, definition, signal, modelCalls);
      await this.checkCancel(claimed);
      if (response.kind === "output") return response.text;

      if (!(await this.moveOrStop(claimed, "RUNNING", "WAITING_TOOL", "TOOL_CALL"))) throw new Stop("CANCELLED", "AI_EXECUTION_CANCELLED");
      history.push({ role: "assistant", toolCalls: response.calls });
      for (const call of response.calls) {
        if (toolCalls >= limits.maxToolCalls) throw new Stop("FAILED", "AI_EXECUTION_LIMIT_EXCEEDED");
        toolCalls += 1;
        const outcome = await this.toolExecutor.call(context, call, toolCalls, limits);
        await this.checkCancel(claimed);
        if (!outcome.ok) {
          if (outcome.code === "AI_EXECUTION_CANCELLED") throw new Stop("CANCELLED", outcome.code);
          if (outcome.status === "FAILED") throw new Stop("FAILED", outcome.code);
          if (outcome.status === "DENIED" && (definition.onToolDenied ?? "fail") === "fail") throw new Stop("FAILED", outcome.code);
        }
        history.push({ role: "tool", toolKey: String(call.toolKey), content: toolContent(call.toolKey, outcome) });
      }
      if (!(await this.moveOrStop(claimed, "WAITING_TOOL", "RUNNING", "MODEL_CALL"))) throw new Stop("CANCELLED", "AI_EXECUTION_CANCELLED");
    }
  }

  /** Only the enabled tools of the allowlist go to the provider: key, description and input JSON Schema (FR-034). */
  private toolSpecs(execution: Loaded): ModelToolSpec[] {
    return execution.agentVersionRef.tools.flatMap(({ tool: row }) => {
      const tool = row.status === "ENABLED" ? this.definitions.tools.find((candidate) => candidate.key === row.key) : undefined;
      return tool ? [{ key: tool.key, description: tool.description, inputJsonSchema: jsonSchemaOf(tool.inputSchema) }] : [];
    }).sort((x, y) => x.key.localeCompare(y.key));
  }

  private moveOrStop(claimed: ClaimedExecution, from: "RUNNING" | "WAITING_TOOL", to: "RUNNING" | "WAITING_TOOL", step: "MODEL_CALL" | "TOOL_CALL") {
    return this.prisma.runInTransaction((tx) => this.store.move(tx, claimed.id, claimed.claimToken, from, to, new Date(), step));
  }

  /** Permission, agent, config and resource checked again at start (FR-032), from the database. */
  private async reauthorize(execution: Loaded, definition: AgentDefinition, signal: AbortSignal) {
    const agent = execution.agentVersionRef.agent;
    if (agent.status !== "ACTIVE") throw new Stop("CANCELLED", "AI_AGENT_DISABLED");
    const config = await this.modelConfigs.byId(execution.modelConfigId);
    if (!config || config.status !== "ENABLED" || !this.gateway.providerFor(config.provider)) throw new Stop("FAILED", "AI_MODEL_UNAVAILABLE");
    const permissions = await this.permissions.effectivePermissions(execution.requestedByUserId);
    if (!permissions.has(execution.agentVersionRef.requiredPermission)) throw new Stop("FAILED", "AI_CONTEXT_ACCESS_DENIED");
    const resource = execution.resourceType && execution.resourceId ? { type: execution.resourceType, id: execution.resourceId } : null;
    if (resource && (await this.resources.owns(execution.workspaceId, execution.agentVersionRef.resourceTypes, resource)) !== "owned") {
      throw new Stop("FAILED", "AI_CONTEXT_ACCESS_DENIED");
    }
    const context: AiExecutionContext = createExecutionContext({
      executionId: execution.id,
      userId: execution.requestedByUserId,
      workspaceId: execution.workspaceId,
      agentKey: execution.agentKey,
      agentVersionId: execution.agentVersionId,
      riskLevel: execution.riskLevel === "L2_PROPOSAL" ? "L2_PROPOSAL" : "L1_READ_ONLY",
      permissions,
      allowedToolKeys: execution.agentVersionRef.tools.map((t) => t.tool.key),
      resource,
      correlationId: execution.correlationId,
      deadline: execution.deadlineAt,
      signal,
    });
    return { config, context };
  }

  /** One call to the model, always recorded in `ai_model_calls` (FR-059), success or not. */
  private async callModel(
    claimed: ClaimedExecution,
    execution: Loaded,
    config: RegisteredModelConfig,
    limits: ReturnType<typeof effectiveLimits>,
    request: ReturnType<typeof buildEnvelope>,
    definition: AgentDefinition,
    signal: AbortSignal,
    sequence: number,
  ): Promise<ModelResponse> {
    const startedAt = new Date();
    try {
      const result = await this.gateway.call({
        config,
        request,
        limits,
        deadline: execution.deadlineAt,
        signal,
        structuredSchema: definition.output ? jsonSchemaOf(definition.output.schema) : undefined,
      });
      await this.recordCall(claimed, config, sequence, startedAt, { status: "SUCCEEDED", attempts: result.attempts, errorCode: null, durationMs: result.durationMs, usage: result.response.usage });
      aiLog(this.logger, "ai.model_call", {
        ...this.logBase(execution),
        durationMs: result.durationMs,
        attempts: result.attempts,
        inputTokens: result.response.usage?.inputTokens ?? null,
        outputTokens: result.response.usage?.outputTokens ?? null,
      });
      return result.response;
    } catch (error) {
      if (error instanceof AiFailure) {
        await this.recordCall(claimed, config, sequence, startedAt, {
          status: error.code === "AI_TIMEOUT" ? "TIMED_OUT" : "FAILED",
          attempts: error.attempts,
          errorCode: error.code,
          durationMs: error.durationMs,
          usage: null,
        });
      }
      throw error;
    }
  }

  private async recordCall(
    claimed: ClaimedExecution,
    config: RegisteredModelConfig,
    sequence: number,
    startedAt: Date,
    call: { status: "SUCCEEDED" | "FAILED" | "TIMED_OUT"; attempts: number; errorCode: AiErrorCode | null; durationMs: number; usage: import("../definitions/types").ModelUsage | null },
  ): Promise<void> {
    await this.prisma.runInTransaction(async (tx) => {
      await this.usage.record(tx, { executionId: claimed.id, sequence, config, startedAt, ...call });
      await tx.aiExecution.updateMany({ where: { id: claimed.id, claimToken: claimed.claimToken }, data: { modelCalls: { increment: 1 } } });
    });
  }

  private async checkCancel(claimed: ClaimedExecution): Promise<void> {
    const row = await this.prisma.aiExecution.findUnique({ where: { id: claimed.id }, select: { cancelRequestedAt: true, claimToken: true } });
    if (!row || row.claimToken !== claimed.claimToken) throw new Stop("CANCELLED", "AI_EXECUTION_CANCELLED");
    if (row.cancelRequestedAt) throw new Stop("CANCELLED", "AI_EXECUTION_CANCELLED");
  }

  /**
   * COMPLETED and its result in one transaction, only under the claim and with no cancellation:
   * an L1 result goes to `ai_execution_outputs`; an L2 result becomes a READY_FOR_REVIEW proposal
   * (research A13), never a domain write (FR-044).
   */
  private async complete(claimed: ClaimedExecution, execution: Loaded, definition: AgentDefinition, output: unknown): Promise<void> {
    const proposal = execution.riskLevel === "L2_PROPOSAL" ? definition.proposal : undefined;
    if (execution.riskLevel === "L2_PROPOSAL" && !proposal) throw new Stop("FAILED", "AI_OUTPUT_VALIDATION_FAILED");
    let itemIds: string[] = [];
    if (proposal) {
      itemIds = proposal.itemIds(output);
      if (itemIds.length === 0 || new Set(itemIds).size !== itemIds.length) throw new Stop("FAILED", "AI_OUTPUT_VALIDATION_FAILED");
    }
    const proposalId = proposal ? randomUUID() : null;
    const done = await this.prisma.runInTransaction(async (tx) => {
      const now = new Date();
      const finished = await this.store.finish(tx, {
        executionId: claimed.id,
        from: ["VALIDATING_OUTPUT"],
        to: "COMPLETED",
        errorCode: null,
        now,
        claimToken: claimed.claimToken,
        requireNoCancel: true,
        actor: { type: "SYSTEM" },
        proposalId,
        step: proposal ? "PROPOSAL_CREATED" : null,
      });
      if (!finished) return null;
      if (proposal && proposalId) {
        await tx.aiProposal.create({
          data: {
            id: proposalId,
            workspaceId: execution.workspaceId,
            executionId: claimed.id,
            agentVersionId: execution.agentVersionId,
            agentKey: execution.agentKey,
            proposalType: proposal.type,
            targetResourceType: execution.resourceType ?? "NONE",
            targetResourceId: execution.resourceId,
            payload: output as Prisma.InputJsonValue,
            itemIds,
            expiresAt: new Date(now.getTime() + this.config.ai.proposalTtlDays * 86_400_000),
            createdAt: now,
          },
        });
        await this.audit.record(tx, {
          type: "ai_proposal.created",
          actorType: "SYSTEM",
          targetType: "AI_PROPOSAL",
          targetId: proposalId,
          metadata: { executionId: claimed.id, agentKey: execution.agentKey, proposalType: proposal.type, itemCount: itemIds.length },
        });
      } else if (execution.outputSchemaVersionId) {
        await tx.aiExecutionOutput.create({
          data: { executionId: claimed.id, outputSchemaVersionId: execution.outputSchemaVersionId, output: output as Prisma.InputJsonValue },
        });
      }
      return finished;
    });
    if (!done) {
      // Cancelled (or lost) between the validation and the commit: the result is discarded.
      await this.end(claimed, execution, new Stop("CANCELLED", "AI_EXECUTION_CANCELLED"));
      return;
    }
    aiLog(this.logger, "ai.execution_completed", { ...this.logBase(execution), status: "COMPLETED", durationMs: done.durationMs });
  }

  /** Final status of a stopped run, still conditional on the claim. */
  private async end(claimed: ClaimedExecution, execution: Loaded, stop: Stop): Promise<void> {
    const finished = await this.prisma.runInTransaction((tx) =>
      this.store.finish(tx, {
        executionId: claimed.id,
        from: RUNNING_STATES,
        to: stop.to,
        errorCode: stop.code,
        now: new Date(),
        claimToken: claimed.claimToken,
        actor: { type: "SYSTEM" },
      }),
    );
    if (finished) aiLog(this.logger, "ai.execution_ended", { ...this.logBase(execution), status: stop.to, errorCode: stop.code, durationMs: finished.durationMs });
  }

  private lost(_claimed: ClaimedExecution, execution: Loaded): void {
    aiLog(this.logger, "ai.claim_lost", this.logBase(execution), "warn");
  }

  private stopFor(code: AiErrorCode): Stop {
    if (code === "AI_EXECUTION_CANCELLED") return new Stop("CANCELLED", code);
    if (code === "AI_TIMEOUT") return new Stop("TIMED_OUT", code);
    return new Stop("FAILED", code);
  }

  private logUnexpected(execution: Loaded, error: unknown): void {
    aiLog(this.logger, "ai.runner_error", { ...this.logBase(execution), errorName: error instanceof Error ? error.name : "unknown" }, "error");
  }

  private logBase(execution: Loaded) {
    return {
      executionId: execution.id,
      correlationId: execution.correlationId,
      agentKey: execution.agentKey,
      agentVersion: execution.agentVersion,
      promptVersion: execution.promptVersion,
      provider: execution.provider,
      model: execution.model,
    };
  }
}

/** The request input goes to the model only as delimited data (FR-054). */
function untrustedInput(input: Prisma.JsonValue): UntrustedContent[] {
  if (input === null || (typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0)) return [];
  return [{ source: "input", text: JSON.stringify(input) }];
}

/**
 * A tool result as the model sees it: untrusted data. A resource outside the workspace reads as
 * "not found" with no detail (US2-6, US3-5); other refusals carry only their code.
 */
function toolContent(toolKey: unknown, outcome: ToolCallOutcome): UntrustedContent {
  const source = `tool:${String(toolKey).slice(0, 63)}`;
  if (outcome.ok) return { source, text: JSON.stringify(outcome.result) };
  const error = outcome.code === "AI_CONTEXT_ACCESS_DENIED" ? "NOT_FOUND" : outcome.code;
  return { source, text: JSON.stringify({ error }) };
}
