import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
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
  type ProposalBuildContext,
  type UntrustedContent,
} from "../definitions/types";
import type { ModelTier } from "../definitions/model-families";
import { type GatewayLeg, type GatewayRoute, type GatewayTask, ModelGateway } from "../gateway/model-gateway";
import { AiFailure } from "../gateway/provider-errors";
import type { TaskPolicyFields } from "../policy/task-policy";
import { escalationTierOf } from "../policy/tiers";
import { StructuredOutputValidator } from "../output/structured-output.validator";
import { jsonSchemaOf } from "../registry/ai-definitions.check";
import { AiModelConfigRegistry, type RegisteredModelConfig } from "../registry/ai-model-config.registry";
import { AiPolicyRegistry } from "../registry/ai-policy.registry";
import { AiTaskRegistry } from "../registry/ai-task.registry";
import { AiToolExecutor, type ToolCallOutcome } from "../tools/ai-tool-executor";
import { AiUsageRecorder } from "../usage/ai-usage.recorder";
import { AiExecutionAborts } from "./ai-execution-aborts";
import { createExecutionContext } from "./ai-execution-context";
import { AiExecutionStore } from "./ai-execution.store";
import { aiLog, rejectReasonOf } from "./ai-log";
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

/** The route of a running execution: its configs as registered now, and the task's settings. */
interface ExecutionRoute extends GatewayRoute {
  primary: RegisteredModelConfig;
  fallback: RegisteredModelConfig | null;
  task: GatewayTask;
  /** Set on the route of the escalated call (009 research H9); `recorded` once its first leg is written. */
  escalation?: { fromTier: ModelTier; toTier: ModelTier; reason: "OUTPUT_INVALID"; recorded: boolean };
}

/** The model ⇄ tools exchange so far: an escalated call goes on from the same point. */
interface Conversation {
  history: ModelHistoryEntry[];
  toolResults: { toolKey: string; output: unknown }[];
  modelCalls: number;
  toolCalls: number;
  /** One `ai_model_calls` row per leg: a logical call with a fallback writes two (008 research G6). */
  rows: { next: number };
}

/** Failures of the output that an escalation may answer (contracts/model-policy.md "Escalation"). */
const ESCALATION_CODES: ReadonlySet<AiErrorCode> = new Set(["AI_OUTPUT_PARSE_FAILED", "AI_OUTPUT_VALIDATION_FAILED"]);

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
    private readonly tasks: AiTaskRegistry,
    private readonly policy: AiPolicyRegistry,
    private readonly gateway: ModelGateway,
    private readonly validator: StructuredOutputValidator,
    private readonly usage: AiUsageRecorder,
    private readonly store: AiExecutionStore,
    private readonly aborts: AiExecutionAborts,
    private readonly resources: AiResourceResolver,
    private readonly toolExecutor: AiToolExecutor,
    private readonly audit: AuditService,
    private readonly moduleRef: ModuleRef,
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
    const { route, context } = await this.reauthorize(execution, definition, signal);
    const limits = effectiveLimits(this.config.ai.limits, definition);
    await this.checkCancel(claimed);

    const conversation: Conversation = { history: [], toolResults: [], modelCalls: 0, toolCalls: 0, rows: { next: 0 } };
    let text = await this.converse(claimed, execution, definition, route, context, limits, signal, conversation);
    await this.checkCancel(claimed);

    // Validated while still RUNNING, so an invalid output can be escalated once (009 research H9).
    let validation = definition.output ? this.validator.validate(text, definition.output.schema, limits.maxOutputBytes) : null;
    if (definition.output && validation && !validation.ok && ESCALATION_CODES.has(validation.code)) {
      const escalated = await this.escalationRoute(execution, route, conversation.modelCalls, limits, validation.code);
      if (escalated) {
        aiLog(this.logger, "ai.output_invalid", { ...this.logBase(execution), errorCode: validation.code, issuePaths: validation.issues.map((i) => i.path) }, "warn");
        aiLog(this.logger, "ai.execution_escalated", { ...this.logBase(execution), task: execution.taskKey, fromTier: escalated.escalation!.fromTier, toTier: escalated.escalation!.toTier, configKey: escalated.primary.key, errorCode: validation.code });
        text = await this.converse(claimed, execution, definition, escalated, context, limits, signal, conversation);
        await this.checkCancel(claimed);
        validation = this.validator.validate(text, definition.output.schema, limits.maxOutputBytes);
      }
    }

    const moved = await this.prisma.runInTransaction((tx) =>
      this.store.move(tx, claimed.id, claimed.claimToken, "RUNNING", "VALIDATING_OUTPUT", new Date(), "OUTPUT_VALIDATION"),
    );
    if (!moved) return this.lost(claimed, execution);
    if (!definition.output || !validation) throw new Stop("FAILED", "AI_OUTPUT_VALIDATION_FAILED");
    if (!validation.ok) {
      aiLog(this.logger, "ai.output_invalid", { ...this.logBase(execution), errorCode: validation.code, issuePaths: validation.issues.map((i) => i.path) }, "warn");
      throw new Stop("FAILED", validation.code);
    }
    await this.complete(claimed, execution, definition, validation.output, conversation.toolResults);
  }

  /**
   * The route of an escalation after an invalid output (contracts/model-policy.md "Escalation"):
   * only when the task's policy allows it, below its ceiling, once per execution, with room for
   * one more model call and before the deadline; the model is the policy's choice at the next
   * tier (same order, same-tier fallback). null → the execution fails with the original code.
   * A teacher rejecting a proposal never gets here.
   */
  private async escalationRoute(
    execution: Loaded,
    route: ExecutionRoute,
    modelCalls: number,
    limits: ReturnType<typeof effectiveLimits>,
    code: AiErrorCode,
  ): Promise<ExecutionRoute | null> {
    if (route.escalation || execution.escalationUsed || !execution.taskKey || !execution.tier) return null;
    if (modelCalls >= limits.maxModelCalls || Date.now() >= execution.deadlineAt.getTime()) return null;
    const task = await this.prisma.aiTask.findUnique({ where: { key: execution.taskKey }, select: { id: true, policy: true } });
    const toTier = task ? escalationTierOf(task.policy as unknown as TaskPolicyFields, execution.tier) : null;
    if (!task || !toTier) return null;
    const selected = await this.policy.routeFor(task.id, toTier);
    if (!selected || "unavailable" in selected) {
      aiLog(this.logger, "ai.escalation_unavailable", { ...this.logBase(execution), task: execution.taskKey, fromTier: execution.tier, toTier, errorCode: code }, "warn");
      return null;
    }
    return {
      primary: selected.primary,
      fallback: selected.fallback,
      task: route.task,
      escalation: { fromTier: execution.tier, toTier, reason: "OUTPUT_INVALID", recorded: false },
    };
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
    route: ExecutionRoute,
    context: AiExecutionContext,
    limits: ReturnType<typeof effectiveLimits>,
    signal: AbortSignal,
    conversation: Conversation,
  ): Promise<string> {
    const { history, toolResults, rows } = conversation;
    const tools = this.toolSpecs(execution);
    for (;;) {
      if (conversation.modelCalls >= limits.maxModelCalls) throw new Stop("FAILED", "AI_EXECUTION_LIMIT_EXCEEDED");
      const request = buildEnvelope({
        systemInstructions: definition.prompt.systemInstructions,
        context: definition.buildContext?.(context) ?? {},
        untrusted: untrustedInput(execution.input),
        tools,
        history,
      });
      await this.store.setStep(this.prisma, claimed.id, claimed.claimToken, "MODEL_CALL");
      conversation.modelCalls += 1;
      const response = await this.callModel(claimed, execution, route, limits, request, definition, signal, rows);
      await this.checkCancel(claimed);
      if (response.kind === "output") return response.text;

      if (!(await this.moveOrStop(claimed, "RUNNING", "WAITING_TOOL", "TOOL_CALL"))) throw new Stop("CANCELLED", "AI_EXECUTION_CANCELLED");
      history.push({ role: "assistant", toolCalls: response.calls });
      for (const call of response.calls) {
        if (conversation.toolCalls >= limits.maxToolCalls) throw new Stop("FAILED", "AI_EXECUTION_LIMIT_EXCEEDED");
        conversation.toolCalls += 1;
        const outcome = await this.toolExecutor.call(context, call, conversation.toolCalls, limits);
        await this.checkCancel(claimed);
        if (outcome.ok) toolResults.push({ toolKey: String(call.toolKey), output: outcome.result });
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
    const route = await this.routeOf(execution);
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
    return { route, context };
  }

  /**
   * The route fixed at request (008 research G5; chosen by the model policy since 009), read
   * again: the primary and the fallback with their current status, and the task's settings (a
   * pre-008 execution uses its config's). Neither usable → `AI_MODEL_UNAVAILABLE`.
   */
  private async routeOf(execution: Loaded): Promise<ExecutionRoute> {
    const primary = await this.modelConfigs.byId(execution.modelConfigId);
    const fallback = execution.fallbackModelConfigId ? await this.modelConfigs.byId(execution.fallbackModelConfigId) : null;
    if (!primary || !(this.gateway.isUsable(primary) || (fallback !== null && this.gateway.isUsable(fallback)))) {
      throw new Stop("FAILED", "AI_MODEL_UNAVAILABLE");
    }
    const task = execution.taskKey ? await this.tasks.byKey(execution.taskKey) : null;
    const settings: GatewayTask = task ?? { parameters: primary.parameters, maxOutputTokens: primary.maxOutputTokens, timeoutMs: primary.timeoutMs };
    return { primary, fallback, task: settings };
  }

  /**
   * One logical call to the model: every leg the gateway reports is recorded in `ai_model_calls`
   * (006 FR-059, 008 FR-016), success or not.
   */
  private async callModel(
    claimed: ClaimedExecution,
    execution: Loaded,
    route: ExecutionRoute,
    limits: ReturnType<typeof effectiveLimits>,
    request: ReturnType<typeof buildEnvelope>,
    definition: AgentDefinition,
    signal: AbortSignal,
    rows: { next: number },
  ): Promise<ModelResponse> {
    let legs: readonly GatewayLeg[] = [];
    try {
      const result = await this.gateway.call({
        route: { primary: route.primary, fallback: route.fallback },
        task: route.task,
        request,
        limits,
        deadline: execution.deadlineAt,
        signal,
        structuredSchema: definition.output ? jsonSchemaOf(definition.output.schema) : undefined,
      });
      legs = result.legs;
      return result.response;
    } catch (error) {
      if (error instanceof AiFailure) legs = error.legs;
      throw error;
    } finally {
      for (const leg of legs) await this.recordLeg(claimed, execution, route, leg, (rows.next += 1));
    }
  }

  /**
   * One leg: its `ai_model_calls` row and the execution's counter in one transaction, and for a
   * fallback leg `fallback_used` and its audit event too (008 FR-016); the first leg of an
   * escalated call also records the escalation on the execution and audits it (009 FR-015); then
   * its log line.
   */
  private async recordLeg(claimed: ClaimedExecution, execution: Loaded, route: ExecutionRoute, leg: GatewayLeg, sequence: number): Promise<void> {
    const config = [route.primary, route.fallback].find((candidate) => candidate?.key === leg.config.key)!;
    await this.prisma.runInTransaction(async (tx) => {
      await this.usage.record(tx, {
        executionId: claimed.id,
        sequence,
        config,
        startedAt: leg.startedAt,
        status: leg.status,
        attempts: leg.attempts,
        errorCode: leg.errorCode,
        durationMs: leg.durationMs,
        usage: leg.usage,
        servedModel: leg.servedModel,
        isFallback: leg.isFallback,
        isEscalation: route.escalation !== undefined,
      });
      await tx.aiExecution.updateMany({
        where: { id: claimed.id, claimToken: claimed.claimToken },
        data: { modelCalls: { increment: 1 }, ...(leg.isFallback ? { fallbackUsed: true } : {}) },
      });
      const escalation = route.escalation;
      if (escalation && !escalation.recorded) {
        await tx.aiExecution.updateMany({
          where: { id: claimed.id, claimToken: claimed.claimToken },
          data: {
            escalationUsed: true,
            escalationFromTier: escalation.fromTier,
            escalationToTier: escalation.toTier,
            escalationReason: escalation.reason,
            escalationModelConfigId: route.primary.id,
          },
        });
        await this.audit.record(tx, {
          type: "ai_execution.escalated",
          actorType: "SYSTEM",
          targetType: "AI_EXECUTION",
          targetId: claimed.id,
          metadata: { taskKey: execution.taskKey, fromTier: escalation.fromTier, toTier: escalation.toTier, reason: escalation.reason, modelConfigKey: route.primary.key },
        });
        escalation.recorded = true;
      }
      if (leg.isFallback && leg.trigger) {
        await this.audit.record(tx, {
          type: "ai_execution.fallback_used",
          actorType: "SYSTEM",
          targetType: "AI_EXECUTION",
          targetId: claimed.id,
          metadata: {
            primaryConfigKey: route.primary.key,
            fallbackConfigKey: config.key,
            reason: leg.trigger.reason,
            primaryErrorCode: leg.trigger.primaryErrorCode,
          },
        });
      }
    });
    aiLog(this.logger, "ai.model_call", {
      ...this.logBase(execution),
      task: execution.taskKey,
      configKey: config.key,
      provider: config.provider,
      model: config.model,
      servedModel: leg.servedModel,
      fallback: leg.isFallback,
      escalation: route.escalation !== undefined,
      status: leg.status,
      durationMs: leg.durationMs,
      attempts: leg.attempts,
      inputTokens: leg.usage?.inputTokens ?? null,
      outputTokens: leg.usage?.outputTokens ?? null,
      errorCode: leg.errorCode ?? undefined,
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
  private async complete(
    claimed: ClaimedExecution,
    execution: Loaded,
    definition: AgentDefinition,
    output: unknown,
    toolResults: ProposalBuildContext["toolResults"],
  ): Promise<void> {
    const proposal = execution.riskLevel === "L2_PROPOSAL" ? definition.proposal : undefined;
    if (execution.riskLevel === "L2_PROPOSAL" && !proposal) throw new Stop("FAILED", "AI_OUTPUT_VALIDATION_FAILED");
    const built = proposal ? this.buildProposal(execution, proposal, output, toolResults) : null;
    if (built && (built.itemIds.length === 0 || new Set(built.itemIds).size !== built.itemIds.length)) {
      throw new Stop("FAILED", "AI_OUTPUT_VALIDATION_FAILED");
    }
    const itemIds = built?.itemIds ?? [];
    const proposalId = built ? randomUUID() : null;
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
        step: built ? "PROPOSAL_CREATED" : null,
      });
      if (!finished) return null;
      if (proposal && built && proposalId) {
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
            payload: built.content as Prisma.InputJsonValue,
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
        // 010 research X8: the domain's records, all or nothing with the proposal.
        if (proposal.materialize) {
          await proposal
            .materialize(tx, {
              proposalId,
              executionId: claimed.id,
              workspaceId: execution.workspaceId,
              resource: execution.resourceType && execution.resourceId ? { type: execution.resourceType, id: execution.resourceId } : null,
              content: built.content,
              itemIds,
              now,
              get: (token) => this.moduleRef.get(token, { strict: false }),
            })
            .catch((error: unknown) => {
              aiLog(
                this.logger,
                "ai.materialize_failed",
                { ...this.logBase(execution), errorCode: "AI_OUTPUT_VALIDATION_FAILED", errorName: error instanceof Error ? error.name : "unknown", rejectReason: rejectReasonOf(error) },
                "warn",
              );
              throw new Stop("FAILED", "AI_OUTPUT_VALIDATION_FAILED");
            });
        }
      } else if (!proposal && execution.outputSchemaVersionId) {
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

  /**
   * The proposal of a validated L2 output: the agent's `build` hook when it has one (007 research
   * C6), otherwise the output itself. `null` → nothing to propose. A throwing hook means the output
   * could not become a proposal: FAILED `AI_OUTPUT_VALIDATION_FAILED`, logged without content.
   */
  private buildProposal(
    execution: Loaded,
    proposal: NonNullable<AgentDefinition["proposal"]>,
    output: unknown,
    toolResults: ProposalBuildContext["toolResults"],
  ): { content: unknown; itemIds: string[] } | null {
    if (!proposal.build) return { content: output, itemIds: proposal.itemIds(output) };
    try {
      return proposal.build(output, { toolResults });
    } catch (error) {
      aiLog(
        this.logger,
        "ai.output_invalid",
        { ...this.logBase(execution), errorCode: "AI_OUTPUT_VALIDATION_FAILED", errorName: error instanceof Error ? error.name : "unknown", rejectReason: rejectReasonOf(error) },
        "warn",
      );
      throw new Stop("FAILED", "AI_OUTPUT_VALIDATION_FAILED");
    }
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
