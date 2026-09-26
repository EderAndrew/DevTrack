import { Inject, Injectable } from "@nestjs/common";
import type { AiAgentOperationsView, AiHealth, AiMetrics, AiMetricsPeriod, AiModelConfigStatus, AiModelConfigView, AiProviderStatus } from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../platform/database/prisma.service";
import type { Tx } from "../../../platform/database/transaction";
import { invalidStateTransition, notFound } from "../../../platform/http/errors";
import { AuditService } from "../../audit/audit.service";
import { AI_DEFINITIONS, type AiDefinitions } from "../definitions/types";
import { AiExecutionStore } from "../execution/ai-execution.store";
import { PERIOD_MS, queryAgentMetrics, queryModelUsage } from "./ai-metrics.query";

/** Longest wait for one provider's health check (contracts/http-api.md). */
export const HEALTH_TIMEOUT_MS = 5_000;

export interface OperationsActor {
  userId: string;
  requestId: string | null;
}

export interface AgentStatusChange {
  changed: boolean;
  /** QUEUED executions of the agent that ended CANCELLED with this change. */
  cancelledExecutions: number;
}

const AGENT_INCLUDE = {
  currentVersion: {
    include: {
      modelConfig: { select: { key: true } },
      task: { select: { primaryModelConfig: { select: { key: true } } } },
      promptVersion: { select: { version: true } },
      outputSchema: { select: { version: true } },
      tools: { select: { tool: { select: { key: true } } } },
    },
  },
} satisfies Prisma.AiAgentInclude;

/**
 * Operation of the AI foundation by the administrator (006 US7, research A20, A21): health,
 * aggregates, agents and model configs — never pedagogical content, resources, users, prompts or
 * credentials (FR-031). The per-agent kill switch lives here (FR-051): the transaction that
 * disables an agent also ends its QUEUED executions as CANCELLED (`AI_AGENT_DISABLED`), so none of
 * them reaches the model; one already running is stopped by the runner's own check at start. The
 * registries read the database on every lookup, so a change applies to the next request.
 */
@Injectable()
export class AiOperationsService {
  constructor(
    @Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly store: AiExecutionStore,
  ) {}

  /** Each provider answers once, in parallel, within 5 s; an error or a timeout is DOWN. */
  async health(): Promise<AiHealth> {
    const configs = await this.prisma.aiModelConfig.findMany({ orderBy: { key: "asc" } });
    const statuses = new Map<string, Promise<AiProviderStatus>>();
    for (const provider of new Set(configs.map((config) => config.provider))) statuses.set(provider, this.providerHealth(provider));
    const checkedAt = new Date().toISOString();
    return {
      checkedAt,
      modelConfigs: await Promise.all(
        configs.map(async (config) => ({
          key: config.key,
          provider: config.provider,
          model: config.model,
          status: config.status,
          providerStatus: await statuses.get(config.provider)!,
        })),
      ),
    };
  }

  async metrics(period: AiMetricsPeriod, now = new Date()): Promise<AiMetrics> {
    const from = new Date(now.getTime() - PERIOD_MS[period]);
    const to = new Date(now.getTime() + 1);
    return {
      from: from.toISOString(),
      to: now.toISOString(),
      byAgent: await queryAgentMetrics(this.prisma, from, to),
      byModel: await queryModelUsage(this.prisma, from, to),
    };
  }

  async listAgents(): Promise<AiAgentOperationsView[]> {
    const agents = await this.prisma.aiAgent.findMany({ where: { currentVersionId: { not: null } }, include: AGENT_INCLUDE, orderBy: { key: "asc" } });
    const counts = await this.queueCounts(this.prisma);
    return agents.map((agent) => this.agentView(agent, counts));
  }

  async listModelConfigs(): Promise<AiModelConfigView[]> {
    const configs = await this.prisma.aiModelConfig.findMany({ orderBy: { key: "asc" } });
    const users = await this.configUsers(this.prisma);
    return configs.map((config) => this.configView(config, users));
  }

  /** ACTIVE ⇄ DISABLED; the same status again changes nothing; DRAFT or DEPRECATED agents → 409. */
  async changeAgentStatus(actor: OperationsActor, agentKey: string, to: "ACTIVE" | "DISABLED"): Promise<AgentStatusChange & { view: AiAgentOperationsView }> {
    return this.prisma.runInTransaction(async (tx) => {
      const [agent] = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM ai_agents WHERE key = ${agentKey} AND current_version_id IS NOT NULL FOR UPDATE`;
      if (!agent) throw notFound();
      let change: AgentStatusChange = { changed: false, cancelledExecutions: 0 };
      if (agent.status !== to) {
        if (agent.status !== "ACTIVE" && agent.status !== "DISABLED") throw invalidStateTransition();
        change = { changed: true, cancelledExecutions: await this.applyAgentStatus(tx, actor, agent.id, agentKey, to) };
      }
      const row = await tx.aiAgent.findUniqueOrThrow({ where: { id: agent.id }, include: AGENT_INCLUDE });
      return { ...change, view: this.agentView(row, await this.queueCounts(tx)) };
    });
  }

  /** ENABLED ⇄ DISABLED; new requests to the agents of a disabled config answer 503, queued ones fail at start. */
  async changeModelConfigStatus(actor: OperationsActor, configKey: string, to: AiModelConfigStatus): Promise<AiModelConfigView> {
    return this.prisma.runInTransaction(async (tx) => {
      const [config] = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM ai_model_configs WHERE key = ${configKey} FOR UPDATE`;
      if (!config) throw notFound();
      const row = config.status === to ? await tx.aiModelConfig.findUniqueOrThrow({ where: { id: config.id } }) : await tx.aiModelConfig.update({ where: { id: config.id }, data: { status: to } });
      if (config.status !== to) {
        await this.audit.record(tx, {
          type: to === "DISABLED" ? "ai_model_config.disabled" : "ai_model_config.enabled",
          actorType: "USER",
          actorUserId: actor.userId,
          requestId: actor.requestId,
          targetType: "AI_MODEL_CONFIG",
          targetId: config.id,
          metadata: { configKey, provider: row.provider, model: row.model },
        });
      }
      return this.configView(row, await this.configUsers(tx));
    });
  }

  private async applyAgentStatus(tx: Tx, actor: OperationsActor, agentId: string, agentKey: string, to: "ACTIVE" | "DISABLED"): Promise<number> {
    const updated = await tx.aiAgent.update({ where: { id: agentId }, data: { status: to }, select: { currentVersion: { select: { version: true } } } });
    const version = updated.currentVersion?.version ?? null;
    let cancelled = 0;
    if (to === "DISABLED") {
      const queued = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM ai_executions WHERE agent_key = ${agentKey} AND status = 'QUEUED' ORDER BY created_at, id FOR UPDATE`;
      const now = new Date();
      for (const { id } of queued) {
        const finished = await this.store.finish(tx, {
          executionId: id,
          from: ["QUEUED"],
          to: "CANCELLED",
          errorCode: "AI_AGENT_DISABLED",
          now,
          claimToken: null,
          actor: { type: "SYSTEM" },
        });
        if (finished) cancelled += 1;
      }
    }
    const base = { actorType: "USER" as const, actorUserId: actor.userId, requestId: actor.requestId, targetType: "AI_AGENT" as const, targetId: agentId };
    if (to === "DISABLED") {
      await this.audit.record(tx, { type: "ai_agent.disabled", ...base, metadata: { agentKey, version, cancelledExecutions: cancelled } });
    } else {
      await this.audit.record(tx, { type: "ai_agent.enabled", ...base, metadata: { agentKey, version } });
    }
    return cancelled;
  }

  private async providerHealth(key: string): Promise<AiProviderStatus> {
    const provider = this.definitions.providers.find((candidate) => candidate.key === key);
    if (!provider) return "NOT_CONFIGURED";
    const signal = AbortSignal.timeout(HEALTH_TIMEOUT_MS);
    const timedOut = new Promise<AiProviderStatus>((resolve) => signal.addEventListener("abort", () => resolve("DOWN"), { once: true }));
    try {
      return await Promise.race([provider.healthCheck(signal), timedOut]);
    } catch {
      return "DOWN";
    }
  }

  private async queueCounts(db: Tx): Promise<Map<string, { queued: number; running: number }>> {
    const rows = await db.aiExecution.groupBy({
      by: ["agentKey", "status"],
      where: { status: { in: ["QUEUED", "RUNNING", "WAITING_TOOL", "VALIDATING_OUTPUT"] } },
      _count: { _all: true },
    });
    const counts = new Map<string, { queued: number; running: number }>();
    for (const row of rows) {
      const entry = counts.get(row.agentKey) ?? { queued: 0, running: 0 };
      if (row.status === "QUEUED") entry.queued += row._count._all;
      else entry.running += row._count._all;
      counts.set(row.agentKey, entry);
    }
    return counts;
  }

  /** Keys of the agents whose current version uses each model config, through its task (008) or directly. */
  private async configUsers(db: Tx): Promise<Map<string, string[]>> {
    const versions = await db.aiAgentVersion.findMany({
      where: { currentOf: { some: {} } },
      select: { modelConfigId: true, task: { select: { primaryModelConfigId: true, fallbackModelConfigId: true } }, agent: { select: { key: true } } },
    });
    const users = new Map<string, string[]>();
    for (const version of versions) {
      const configIds = [version.modelConfigId, version.task?.primaryModelConfigId, version.task?.fallbackModelConfigId];
      for (const id of new Set(configIds.filter((value): value is string => typeof value === "string"))) {
        users.set(id, [...(users.get(id) ?? []), version.agent.key].sort());
      }
    }
    return users;
  }

  private agentView(agent: Prisma.AiAgentGetPayload<{ include: typeof AGENT_INCLUDE }>, counts: Map<string, { queued: number; running: number }>): AiAgentOperationsView {
    const version = agent.currentVersion!;
    return {
      key: agent.key,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      version: version.version,
      riskLevel: version.riskLevel,
      // The primary of the task (008); the view gets the whole route with US5.
      modelConfigKey: version.task?.primaryModelConfig.key ?? version.modelConfig!.key,
      promptVersion: version.promptVersion.version,
      outputSchemaVersion: version.outputSchema?.version ?? null,
      toolKeys: version.tools.map((item) => item.tool.key).sort(),
      queued: counts.get(agent.key)?.queued ?? 0,
      running: counts.get(agent.key)?.running ?? 0,
    };
  }

  private configView(config: Prisma.AiModelConfigGetPayload<object>, users: Map<string, string[]>): AiModelConfigView {
    return {
      key: config.key,
      provider: config.provider,
      model: config.model,
      status: config.status,
      maxOutputTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      hasPrice: config.inputPricePerMTok !== null && config.outputPricePerMTok !== null && config.currency !== null,
      agentKeys: users.get(config.id) ?? [],
    };
  }
}
