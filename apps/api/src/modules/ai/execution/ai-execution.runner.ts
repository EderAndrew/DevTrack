import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AiErrorCode } from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { PrismaService } from "../../../platform/database/prisma.service";
import { PermissionResolver } from "../../access-control/permission-resolver";
import { AI_DEFINITIONS, type AgentDefinition, type AiDefinitions, type AiExecutionContext, type UntrustedContent } from "../definitions/types";
import { ModelGateway } from "../gateway/model-gateway";
import { AiFailure } from "../gateway/provider-errors";
import { StructuredOutputValidator } from "../output/structured-output.validator";
import { jsonSchemaOf } from "../registry/ai-definitions.check";
import { AiModelConfigRegistry, type RegisteredModelConfig } from "../registry/ai-model-config.registry";
import { AiUsageRecorder } from "../usage/ai-usage.recorder";
import { AiExecutionAborts } from "./ai-execution-aborts";
import { createExecutionContext } from "./ai-execution-context";
import { AiExecutionStore } from "./ai-execution.store";
import { aiLog } from "./ai-log";
import { effectiveLimits } from "./ai-limits";
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
 * Tools (US3), loop limits (US6) and proposals (US5) plug into this cycle.
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

    const request = buildEnvelope({
      systemInstructions: definition.prompt.systemInstructions,
      context: definition.buildContext?.(context) ?? {},
      untrusted: untrustedInput(execution.input),
      tools: [],
      history: [],
    });
    await this.store.setStep(this.prisma, claimed.id, claimed.claimToken, "MODEL_CALL");
    const text = await this.callModel(claimed, execution, config, limits, request, definition, signal, 1);
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
    await this.complete(claimed, execution, validation.output);
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
    if (resource) {
      const ownership = this.definitions.resources[resource.type];
      if (!ownership || !(await ownership.ownedBy(this.prisma, execution.workspaceId, resource.id))) {
        throw new Stop("FAILED", "AI_CONTEXT_ACCESS_DENIED");
      }
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
  ): Promise<string> {
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
      if (result.response.kind !== "output") throw new Stop("FAILED", "AI_TOOL_NOT_ALLOWED");
      return result.response.text;
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

  private async complete(claimed: ClaimedExecution, execution: Loaded, output: unknown): Promise<void> {
    const done = await this.prisma.runInTransaction(async (tx) => {
      const finished = await this.store.finish(tx, {
        executionId: claimed.id,
        from: ["VALIDATING_OUTPUT"],
        to: "COMPLETED",
        errorCode: null,
        now: new Date(),
        claimToken: claimed.claimToken,
        requireNoCancel: true,
        actor: { type: "SYSTEM" },
      });
      if (!finished) return null;
      if (execution.outputSchemaVersionId) {
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
