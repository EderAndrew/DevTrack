import { Inject, Injectable } from "@nestjs/common";
import type {
  AiAgentOperationsView,
  AiHealth,
  AiMetrics,
  AiMetricsPeriod,
  AiModelCatalogView,
  AiModelCapabilities,
  AiModelConfigStatus,
  AiModelConfigView,
  AiProviderStatus,
  AiTaskPolicyView,
} from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { PrismaService } from "../../../platform/database/prisma.service";
import type { Tx } from "../../../platform/database/transaction";
import { AppException, invalidStateTransition, notFound } from "../../../platform/http/errors";
import { AuditService } from "../../audit/audit.service";
import { AI_DEFINITIONS, type AiDefinitions } from "../definitions/types";
import { CircuitBreaker } from "../gateway/circuit-breaker";
import { AiExecutionStore } from "../execution/ai-execution.store";
import type { TaskPolicyFields } from "../policy/task-policy";
import { maxTierOf } from "../policy/tiers";
import { AiPolicyRegistry } from "../registry/ai-policy.registry";
import { queryBudgets } from "./ai-budget.query";
import { PERIOD_MS, queryAgentMetrics, queryFamilyMetrics, queryModelTaskCost, queryModelUsage, queryTaskMetrics, queryTierMetrics } from "./ai-metrics.query";

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
      task: { select: { id: true, key: true } },
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
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly store: AiExecutionStore,
    private readonly circuit: CircuitBreaker,
    private readonly policy: AiPolicyRegistry,
  ) {}

  /**
   * Each provider answers once, in parallel, within 5 s; an error or a timeout is DOWN. The circuit
   * is the state on this instance (008 research G8).
   */
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
          circuit: this.circuit.state(config.key),
        })),
      ),
    };
  }

  async metrics(period: AiMetricsPeriod, now = new Date()): Promise<AiMetrics> {
    const { from, to } = periodOf(period, now);
    return {
      from: from.toISOString(),
      to: now.toISOString(),
      byAgent: await queryAgentMetrics(this.prisma, from, to),
      byModel: await queryModelUsage(this.prisma, from, to),
      byTask: await queryTaskMetrics(this.prisma, from, to),
      byTier: await queryTierMetrics(this.prisma, from, to),
      byFamily: await queryFamilyMetrics(this.prisma, from, to),
      // The budgets' own periods (today and this month in São Paulo), whatever the metrics period.
      budgets: await queryBudgets(this.prisma, this.config.ai.budgets, now),
    };
  }

  /**
   * The model catalog (009 FR-002, FR-021): the entries with a tier, their approvals by task with
   * the metrics measured, and the real average cost per execution of the task in the period.
   */
  async listModels(period: AiMetricsPeriod, now = new Date()): Promise<AiModelCatalogView[]> {
    const { from, to } = periodOf(period, now);
    const costs = await queryModelTaskCost(this.prisma, from, to);
    const rows = await this.prisma.aiModelConfig.findMany({
      where: { tier: { not: null } },
      include: { taskApprovals: { include: { task: { select: { key: true } } } } },
      orderBy: { key: "asc" },
    });
    return rows.map((row) => ({
      key: row.key,
      family: row.family!,
      model: row.model,
      tier: row.tier!,
      mode: row.mode,
      lifecycle: row.lifecycle,
      status: row.status,
      capabilities: row.capabilities as unknown as AiModelCapabilities,
      contextWindow: row.contextWindow,
      price:
        row.inputPricePerMTok !== null && row.outputPricePerMTok !== null && row.currency !== null
          ? { inputPerMTok: row.inputPricePerMTok.toString(), outputPerMTok: row.outputPricePerMTok.toString(), currency: row.currency.trim() }
          : null,
      approvals: row.taskApprovals
        .map((approval) => ({
          taskKey: approval.task.key,
          valid: approval.valid,
          metrics: approval.metrics as Record<string, number>,
          evaluatedAt: approval.evaluatedAt.toISOString(),
          avgCostPerExecution: costs.get(`${row.id}|${approval.task.key}`) ?? null,
        }))
        .sort((a, b) => a.taskKey.localeCompare(b.taskKey)),
    }));
  }

  /**
   * The task policies (009 FR-006, FR-010) with the policy's choice now — primary, fallback and
   * reason (`DEPRECATED_ONLY` is the deprecated-in-use warning, US5-4) or why the task is
   * unavailable — the agents whose current version runs the task, the admin's override and the
   * models it may fix now (US7).
   */
  async listTasks(): Promise<AiTaskPolicyView[]> {
    const tasks = await this.prisma.aiTask.findMany({ select: { key: true }, orderBy: { key: "asc" } });
    return Promise.all(tasks.map((task) => this.taskView(task.key)));
  }

  /**
   * Fixes `modelConfigKey` for the task (009 FR-024, research H11): only a model the policy admits
   * at the task's preferred tier, in PRODUCTION and enabled (`409 AI_OVERRIDE_NOT_ALLOWED`
   * otherwise). The same override again changes nothing and writes no event.
   */
  async setTaskOverride(actor: OperationsActor, taskKey: string, modelConfigKey: string): Promise<AiTaskPolicyView> {
    await this.prisma.runInTransaction(async (tx) => {
      const task = await lockTask(tx, taskKey);
      if (!(await this.policy.overrideCandidates(task.id)).includes(modelConfigKey)) throw new AppException("AI_OVERRIDE_NOT_ALLOWED");
      const config = await tx.aiModelConfig.findUniqueOrThrow({ where: { key: modelConfigKey }, select: { id: true } });
      const current = await tx.aiTaskOverride.findUnique({ where: { taskId: task.id }, include: { modelConfig: { select: { key: true } } } });
      if (current?.modelConfigId === config.id) return;
      const data = { modelConfigId: config.id, setByUserId: actor.userId, setAt: new Date() };
      await tx.aiTaskOverride.upsert({ where: { taskId: task.id }, create: { taskId: task.id, ...data }, update: data });
      await this.audit.record(tx, {
        type: "ai_task_override.set",
        ...overrideAudit(actor, task.id),
        metadata: { taskKey, modelConfigKey, previousModelConfigKey: current?.modelConfig.key ?? null },
      });
    });
    return this.taskView(taskKey);
  }

  /** Removes the task's override; none → nothing changes and no event is written. */
  async removeTaskOverride(actor: OperationsActor, taskKey: string): Promise<AiTaskPolicyView> {
    await this.prisma.runInTransaction(async (tx) => {
      const task = await lockTask(tx, taskKey);
      const current = await tx.aiTaskOverride.findUnique({ where: { taskId: task.id }, include: { modelConfig: { select: { key: true } } } });
      if (!current) return;
      await tx.aiTaskOverride.delete({ where: { taskId: task.id } });
      await this.audit.record(tx, {
        type: "ai_task_override.removed",
        ...overrideAudit(actor, task.id),
        metadata: { taskKey, modelConfigKey: current.modelConfig.key },
      });
    });
    return this.taskView(taskKey);
  }

  private async taskView(taskKey: string): Promise<AiTaskPolicyView> {
    const task = await this.prisma.aiTask.findUniqueOrThrow({ where: { key: taskKey }, include: { override: { include: { modelConfig: { select: { key: true } } } } } });
    const versions = await this.prisma.aiAgentVersion.findMany({ where: { currentOf: { some: {} }, taskId: task.id }, select: { agent: { select: { key: true } } } });
    const policy = task.policy as unknown as TaskPolicyFields;
    const route = await this.policy.routeFor(task.id);
    return {
      key: task.key,
      mode: policy.mode,
      minimumTier: policy.minimumTier,
      preferredTier: policy.preferredTier,
      maxTier: maxTierOf(policy),
      allowedFamilies: [...policy.allowedFamilies],
      requiredCapabilities: [...policy.requiredCapabilities],
      fallback: policy.fallback,
      escalation: policy.escalation,
      quality: { ...policy.quality },
      agentKeys: versions.map((version) => version.agent.key).sort(),
      selection:
        !route || "unavailable" in route
          ? { unavailable: route?.unavailable ?? "POLICY_INVALID" }
          : { primaryKey: route.primary.key, fallbackKey: route.fallback?.key ?? null, reason: route.reason },
      override: task.override ? { modelConfigKey: task.override.modelConfig.key, setAt: task.override.setAt.toISOString() } : null,
      overrideCandidates: await this.policy.overrideCandidates(task.id),
    };
  }

  async listAgents(): Promise<AiAgentOperationsView[]> {
    const agents = await this.prisma.aiAgent.findMany({ where: { currentVersionId: { not: null } }, include: AGENT_INCLUDE, orderBy: { key: "asc" } });
    const counts = await this.queueCounts(this.prisma);
    return Promise.all(agents.map((agent) => this.agentView(agent, counts)));
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
      return { ...change, view: await this.agentView(row, await this.queueCounts(tx)) };
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

  /**
   * Keys of the agents whose current version may use each model config: the configs its task's
   * policy admits (009), whatever their status or circuit, or the config of a pre-008 version.
   */
  private async configUsers(db: Tx): Promise<Map<string, string[]>> {
    const versions = await db.aiAgentVersion.findMany({
      where: { currentOf: { some: {} } },
      select: { modelConfigId: true, taskId: true, agent: { select: { key: true } } },
    });
    const users = new Map<string, string[]>();
    for (const version of versions) {
      const configIds = [version.modelConfigId, ...(version.taskId ? await this.policy.candidateIds(version.taskId) : [])];
      for (const id of new Set(configIds.filter((value): value is string => typeof value === "string"))) {
        users.set(id, [...(users.get(id) ?? []), version.agent.key].sort());
      }
    }
    return users;
  }

  /** The agent with the route its task's policy would choose now (009); none when unavailable. */
  private async agentView(
    agent: Prisma.AiAgentGetPayload<{ include: typeof AGENT_INCLUDE }>,
    counts: Map<string, { queued: number; running: number }>,
  ): Promise<AiAgentOperationsView> {
    const version = agent.currentVersion!;
    const route = version.task ? await this.policy.routeFor(version.task.id) : null;
    const chosen = route && !("unavailable" in route) ? route : null;
    return {
      key: agent.key,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      version: version.version,
      riskLevel: version.riskLevel,
      // A pre-008 version has no task: its own config is the primary, with no fallback.
      taskKey: version.task?.key ?? null,
      primaryModelConfigKey: version.task ? (chosen?.primary.key ?? null) : (version.modelConfig?.key ?? null),
      fallbackModelConfigKey: chosen?.fallback?.key ?? null,
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

/** The task row, locked for the override change; unknown task → 404. */
async function lockTask(tx: Tx, taskKey: string): Promise<{ id: string }> {
  const [task] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ai_tasks WHERE key = ${taskKey} FOR UPDATE`;
  if (!task) throw notFound();
  return task;
}

const overrideAudit = (actor: OperationsActor, taskId: string) => ({
  actorType: "USER" as const,
  actorUserId: actor.userId,
  requestId: actor.requestId,
  targetType: "AI_TASK" as const,
  targetId: taskId,
});

/** `[from, to)` of a metrics period ending now (the end is exclusive, so `now` itself counts). */
function periodOf(period: AiMetricsPeriod, now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - PERIOD_MS[period]), to: new Date(now.getTime() + 1) };
}
