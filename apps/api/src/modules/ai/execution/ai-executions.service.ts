import { Inject, Injectable } from "@nestjs/common";
import type {
  AiExecutionListQuery,
  AiExecutionPage,
  AiExecutionResult,
  AiExecutionView,
  RequestAiExecutionRequest,
} from "@repo/contracts";
import { Prisma } from "../../../generated/prisma/client";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { PrismaService } from "../../../platform/database/prisma.service";
import { afterCursor, decodeCursor, encodeCursor } from "../../../platform/database/keyset";
import type { Tx } from "../../../platform/database/transaction";
import { AppException, forbidden, invalidStateTransition, notFound, rateLimited, validationError } from "../../../platform/http/errors";
import type { AuthContext } from "../../../platform/http/request-context";
import { RateLimitService } from "../../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../../audit/audit.service";
import { PermissionResolver } from "../../access-control/permission-resolver";
import { ModelGateway } from "../gateway/model-gateway";
import { AiAgentRegistry, type RegisteredAgent } from "../registry/ai-agent.registry";
import { stableHash } from "../registry/ai-definitions.check";
import { type RegisteredRoute, AiTaskRegistry } from "../registry/ai-task.registry";
import { AiExecutionAborts } from "./ai-execution-aborts";
import { AiExecutionStore } from "./ai-execution.store";
import { EXECUTION_SUMMARY_INCLUDE, EXECUTION_VIEW_INCLUDE, toExecutionSummary, toExecutionView } from "./ai-execution.view";
import { AiExecutionWorker } from "./ai-execution.worker";
import { effectiveLimits } from "./ai-limits";
import { AiResourceResolver } from "./ai-resource.resolver";

const PAGE_SIZE = 50;
const RUNNING = ["RUNNING", "WAITING_TOOL", "VALIDATING_OUTPUT"] as const;

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Whether an agent can take a new request now (007 research C12.3); never names the provider nor the model. */
export type AiAvailability = "AVAILABLE" | "AGENT_DISABLED" | "MODEL_UNAVAILABLE" | "PAUSED";

export interface RequestExecutionOptions {
  /**
   * Runs inside the transaction that creates the execution, after `ai_execution.requested` (007
   * research C12.4): a domain writes its own audit there. An exception rolls everything back. It
   * doesn't run when the idempotency key returns an existing execution.
   */
  onCreated?: (tx: Tx, executionId: string) => Promise<void>;
}

export interface RequestedExecution {
  view: AiExecutionView;
  /** false when the idempotency key returned an existing execution (200 instead of 202). */
  created: boolean;
}

/**
 * The teacher's AI executions (006 US1, contracts/http-api.md). The workspace is always the
 * session user (research A2): every lookup is by `(id, workspace_id)`, anything else is 404. The
 * request never waits for the model (SC-006): it checks, records `QUEUED` and wakes the worker.
 * This is, with AiProposalService, the API domain modules use to run agents (research A3).
 */
@Injectable()
export class AiExecutionsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly permissions: PermissionResolver,
    private readonly audit: AuditService,
    private readonly agents: AiAgentRegistry,
    private readonly tasks: AiTaskRegistry,
    private readonly gateway: ModelGateway,
    private readonly store: AiExecutionStore,
    private readonly aborts: AiExecutionAborts,
    private readonly worker: AiExecutionWorker,
    private readonly resources: AiResourceResolver,
  ) {}

  /** In this order: the agent, a usable model config of its route, then the global kill switch. */
  async availability(agentKey: string): Promise<AiAvailability> {
    const agent = await this.agents.byKey(agentKey);
    if (!agent || agent.status !== "ACTIVE") return "AGENT_DISABLED";
    if (!(await this.usableRoute(agent))) return "MODEL_UNAVAILABLE";
    if (this.config.ai.intervalSeconds <= 0) return "PAUSED";
    return "AVAILABLE";
  }

  /**
   * The agent's route when the primary or the fallback can take a call (008 research G5); the
   * runner checks both again at start.
   */
  private async usableRoute(agent: RegisteredAgent): Promise<RegisteredRoute | null> {
    const route = await this.tasks.routeOf(agent);
    if (!route) return null;
    const usable = this.gateway.isUsable(route.primary) || (route.fallback !== null && this.gateway.isUsable(route.fallback));
    return usable ? route : null;
  }

  async request(
    auth: AuthContext,
    body: RequestAiExecutionRequest,
    requestId: string | null,
    options: RequestExecutionOptions = {},
  ): Promise<RequestedExecution> {
    const workspaceId = auth.userId;
    const limit = await this.rateLimit.hit("ai-execution", workspaceId, { limit: this.config.rateLimit.aiExecutionsPerMinute, windowSec: 60 });
    if (limit.blocked) {
      await this.audit.record(this.prisma, {
        type: "ai_execution.rate_limited",
        actorType: "USER",
        actorUserId: workspaceId,
        requestId,
        metadata: { scope: "ai-execution" },
      });
      throw rateLimited(limit.retryAfterSec);
    }

    const agent = await this.agents.byKey(body.agentKey);
    if (!agent || agent.status === "DRAFT" || agent.status === "DEPRECATED") throw new AppException("AI_AGENT_NOT_FOUND");
    if (agent.status === "DISABLED") throw new AppException("AI_AGENT_DISABLED");

    const permissions = await this.permissions.effectivePermissions(workspaceId);
    if (!permissions.has(agent.requiredPermission)) throw forbidden();

    const resource = body.resource ?? null;
    if (resource) await this.resources.assertOwned(workspaceId, agent.resourceTypes, resource);

    const route = await this.usableRoute(agent);
    if (!route) throw new AppException("AI_MODEL_UNAVAILABLE");
    const { primary, fallback } = route;

    const limits = effectiveLimits(this.config.ai.limits, agent.definition);
    const input = this.validateInput(agent, body.input ?? {}, limits.maxInputBytes);
    const requestHash = stableHash({ agentKey: body.agentKey, resource, input });

    const existing = await this.findByKey(workspaceId, body.idempotencyKey);
    if (existing) return this.replay(existing, requestHash);

    let id: string;
    try {
      id = await this.prisma.runInTransaction(async (tx) => {
        const now = new Date();
        const created = await tx.aiExecution.create({
          data: {
            workspaceId,
            requestedByUserId: workspaceId,
            agentVersionId: agent.versionId,
            agentKey: agent.key,
            agentVersion: agent.version,
            promptVersionId: agent.promptVersionId,
            promptVersion: agent.promptVersion,
            outputSchemaVersionId: agent.outputSchemaVersionId,
            modelConfigId: primary.id,
            fallbackModelConfigId: fallback?.id ?? null,
            taskKey: route.task?.key ?? null,
            provider: primary.provider,
            model: primary.model,
            riskLevel: agent.riskLevel,
            resourceType: resource?.type ?? null,
            resourceId: resource?.id ?? null,
            input: input as Prisma.InputJsonValue,
            deadlineAt: new Date(now.getTime() + limits.totalTimeoutMs),
            correlationId: requestId ?? `ai-${body.idempotencyKey}`,
            idempotencyKey: body.idempotencyKey,
            requestHash,
            createdAt: now,
            transitions: { create: { fromStatus: null, toStatus: "QUEUED", occurredAt: now } },
          },
          select: { id: true },
        });
        // All teachers together, per agent (008 FR-015, research G9). Counted after the insert, so
        // a concurrent duplicate that loses the unique index below never counts; a blocked
        // request rolls its execution back.
        const perAgent = await this.rateLimit.hit("ai-agent", agent.key, { limit: this.config.rateLimit.aiAgentPerHour, windowSec: 3600 });
        if (perAgent.blocked) throw new AgentLimitReached(perAgent.retryAfterSec);
        await this.markUsed(tx, agent, now);
        await this.audit.record(tx, {
          type: "ai_execution.requested",
          actorType: "USER",
          actorUserId: workspaceId,
          targetType: "AI_EXECUTION",
          targetId: created.id,
          requestId,
          metadata: {
            agentKey: agent.key,
            agentVersion: agent.version,
            promptVersion: agent.promptVersion,
            modelConfigKey: primary.key,
            taskKey: route.task?.key ?? null,
            fallbackModelConfigKey: fallback?.key ?? null,
            resourceType: resource?.type ?? null,
            riskLevel: agent.riskLevel,
          },
        });
        await options.onCreated?.(tx, created.id);
        return created.id;
      });
    } catch (error) {
      if (error instanceof AgentLimitReached) {
        await this.audit.record(this.prisma, {
          type: "ai_execution.rate_limited",
          actorType: "USER",
          actorUserId: workspaceId,
          requestId,
          metadata: { scope: "agent" },
        });
        throw rateLimited(error.retryAfterSec);
      }
      // A concurrent request with the same key won the unique index (FR-025).
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.findByKey(workspaceId, body.idempotencyKey);
      if (!winner) throw error;
      return this.replay(winner, requestHash);
    }

    this.worker.kick();
    return { view: await this.get(workspaceId, id), created: true };
  }

  /** The newest execution of `agentKey` on `resource` in the workspace, or null. */
  async findLatestForResource(workspaceId: string, agentKey: string, resource: { type: string; id: string }): Promise<AiExecutionView | null> {
    const row = await this.prisma.aiExecution.findFirst({
      where: { workspaceId, agentKey, resourceType: resource.type, resourceId: resource.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: EXECUTION_VIEW_INCLUDE,
    });
    return row ? toExecutionView(row) : null;
  }

  countForResource(workspaceId: string, agentKey: string, resource: { type: string; id: string }): Promise<number> {
    return this.prisma.aiExecution.count({ where: { workspaceId, agentKey, resourceType: resource.type, resourceId: resource.id } });
  }

  async list(workspaceId: string, query: AiExecutionListQuery): Promise<AiExecutionPage> {
    const rows = await this.prisma.aiExecution.findMany({
      where: {
        workspaceId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.agentKey ? { agentKey: query.agentKey } : {}),
        ...(query.cursor ? afterCursor(decodeCursor(query.cursor)) : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      include: EXECUTION_SUMMARY_INCLUDE,
    });
    const page = rows.slice(0, PAGE_SIZE);
    return {
      items: page.map(toExecutionSummary),
      nextCursor: rows.length > PAGE_SIZE ? encodeCursor(page[page.length - 1]!) : null,
    };
  }

  async get(workspaceId: string, id: string): Promise<AiExecutionView> {
    const row = await this.prisma.aiExecution.findFirst({ where: { id, workspaceId }, include: EXECUTION_VIEW_INCLUDE });
    if (!row) throw notFound();
    return toExecutionView(row);
  }

  async getResult(workspaceId: string, id: string): Promise<AiExecutionResult> {
    const row = await this.prisma.aiExecution.findFirst({
      where: { id, workspaceId },
      select: { status: true, output: { include: { outputSchema: { select: { version: true } } } } },
    });
    if (!row) throw notFound();
    if (row.status !== "COMPLETED" || !row.output) throw invalidStateTransition();
    return { executionId: id, schemaVersion: row.output.outputSchema.version, output: row.output.output };
  }

  /**
   * QUEUED ends CANCELLED right away; a running execution gets `cancel_requested_at` and ends at
   * its next check (FR-027, research A10). Repeating returns the same state.
   */
  async cancel(auth: AuthContext, id: string, requestId: string | null): Promise<AiExecutionView> {
    const workspaceId = auth.userId;
    const abort = await this.prisma.runInTransaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ status: string; cancel_requested_at: Date | null }[]>`
        SELECT status, cancel_requested_at FROM ai_executions
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid FOR UPDATE`;
      if (!row) throw notFound();
      const now = new Date();
      if (row.status === "CANCELLED") return false;
      if (row.status === "QUEUED") {
        await this.store.finish(tx, {
          executionId: id,
          from: ["QUEUED"],
          to: "CANCELLED",
          errorCode: "AI_EXECUTION_CANCELLED",
          now,
          claimToken: null,
          actor: { type: "USER", userId: workspaceId, requestId },
        });
        return false;
      }
      if ((RUNNING as readonly string[]).includes(row.status)) {
        if (row.cancel_requested_at) return true;
        await tx.aiExecution.update({ where: { id }, data: { cancelRequestedAt: now } });
        await this.audit.record(tx, {
          type: "ai_execution.cancel_requested",
          actorType: "USER",
          actorUserId: workspaceId,
          targetType: "AI_EXECUTION",
          targetId: id,
          requestId,
          metadata: { from: row.status },
        });
        return true;
      }
      throw invalidStateTransition();
    });
    if (abort) this.aborts.abort(id);
    return this.get(workspaceId, id);
  }

  private validateInput(agent: RegisteredAgent, input: Record<string, unknown>, maxBytes: number): unknown {
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > maxBytes) throw new AppException("AI_EXECUTION_LIMIT_EXCEEDED");
    if (!agent.definition.input) return input;
    const parsed = agent.definition.input.safeParse(input);
    if (!parsed.success) throw validationError();
    return parsed.data;
  }

  private findByKey(workspaceId: string, idempotencyKey: string) {
    return this.prisma.aiExecution.findUnique({
      where: { requestedByUserId_idempotencyKey: { requestedByUserId: workspaceId, idempotencyKey } },
      select: { id: true, requestHash: true, workspaceId: true },
    });
  }

  private async replay(existing: { id: string; requestHash: string; workspaceId: string }, requestHash: string): Promise<RequestedExecution> {
    if (existing.requestHash !== requestHash) throw new AppException("AI_IDEMPOTENCY_KEY_REUSED");
    return { view: await this.get(existing.workspaceId, existing.id), created: false };
  }

  /** The versions an execution used become immutable from now on (FR-010, research A5). */
  private async markUsed(tx: Tx, agent: RegisteredAgent, now: Date): Promise<void> {
    await tx.aiAgentVersion.updateMany({ where: { id: agent.versionId, usedAt: null }, data: { usedAt: now } });
    await tx.aiPromptVersion.updateMany({ where: { id: agent.promptVersionId, usedAt: null }, data: { usedAt: now } });
    if (agent.outputSchemaVersionId) {
      await tx.aiOutputSchemaVersion.updateMany({ where: { id: agent.outputSchemaVersionId, usedAt: null }, data: { usedAt: now } });
    }
  }
}

/** Rolls back the execution of a request past the agent's hourly limit. */
class AgentLimitReached extends Error {
  constructor(readonly retryAfterSec: number) {
    super("agent limit reached");
  }
}
