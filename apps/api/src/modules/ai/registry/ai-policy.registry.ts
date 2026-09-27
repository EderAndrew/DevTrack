import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../platform/database/prisma.service";
import type { ModelCapabilities, ModelTier } from "../definitions/model-families";
import { AI_DEFINITIONS, type AiDefinitions } from "../definitions/types";
import { ModelGateway } from "../gateway/model-gateway";
import {
  type EntryHealth,
  type PolicyCatalogEntry,
  qualifyingEntries,
  type SelectionReason,
  selectRoute,
  type UnavailableReason,
} from "../policy/select-route";
import { type TaskPolicyFields, taskPolicyProblem } from "../policy/task-policy";
import { type RegisteredModelConfig, toRegisteredModelConfig } from "./ai-model-config.registry";
import { type RegisteredTask, toRegisteredTask } from "./ai-task.registry";

/** The route the policy chose for a task: fixed on the execution at request (008 research G5). */
export interface PolicyRoute {
  task: RegisteredTask;
  policy: TaskPolicyFields;
  tier: ModelTier;
  primary: RegisteredModelConfig;
  fallback: RegisteredModelConfig | null;
  reason: SelectionReason;
  overrideIgnored: boolean;
}

export type PolicyRouteResult = PolicyRoute | { unavailable: UnavailableReason };

type Candidate = PolicyCatalogEntry & { config: RegisteredModelConfig };

/**
 * The model policy over the synced registry (009 research H7): reads a task's policy, the catalog
 * (rows with a tier), the task's approvals, the admin's override and each model's health from the
 * gateway (status, provider, circuit — without taking a probe), then asks the pure `selectRoute`.
 * The database is the source, so an app and its registry sync always agree.
 */
@Injectable()
export class AiPolicyRegistry {
  constructor(
    @Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions,
    private readonly prisma: PrismaService,
    private readonly gateway: ModelGateway,
  ) {}

  /** The route of a task at `tier` (its preferred tier by default); `null` when the task is unknown. */
  async routeFor(taskId: string, tier?: ModelTier): Promise<PolicyRouteResult | null> {
    const loaded = await this.load(taskId);
    if (!loaded) return null;
    const { task, policy, catalog, override } = loaded;
    const selectedTier = tier ?? task.preferredTier;
    const route = selectRoute({
      task: policy,
      tier: selectedTier,
      families: this.definitions.families,
      catalog,
      override,
      health: (entry) => this.health(entry.config),
    });
    if ("unavailable" in route) return route;
    return {
      task: toRegisteredTask(task),
      policy,
      tier: selectedTier,
      primary: route.primary.config,
      fallback: route.fallback?.config ?? null,
      reason: route.reason,
      overrideIgnored: route.overrideIgnored,
    };
  }

  /** Ids of the model configs that qualify for the task at its preferred tier, whatever their health. */
  async candidateIds(taskId: string): Promise<string[]> {
    const loaded = await this.load(taskId);
    if (!loaded || taskPolicyProblem(loaded.policy, this.definitions.families) !== null) return [];
    const { task, policy, catalog } = loaded;
    return qualifyingEntries({ task: policy, tier: task.preferredTier, families: this.definitions.families, catalog }).map((entry) => entry.config.id);
  }

  /** Why the task can't take a request now, or null (dry run: no circuit probe is taken). */
  async availability(taskId: string): Promise<UnavailableReason | null> {
    const route = await this.routeFor(taskId);
    if (!route) return "POLICY_INVALID";
    return "unavailable" in route ? route.unavailable : null;
  }

  private async load(taskId: string) {
    const task = await this.prisma.aiTask.findUnique({ where: { id: taskId }, include: { override: true } });
    if (!task) return null;
    const rows = await this.prisma.aiModelConfig.findMany({
      where: { tier: { not: null } },
      include: { taskApprovals: { where: { taskId, valid: true }, select: { id: true } } },
      orderBy: { key: "asc" },
    });
    const catalog: Candidate[] = rows.map((row) => {
      const config = toRegisteredModelConfig(row);
      return {
        key: row.key,
        family: row.family!,
        mode: row.mode,
        tier: row.tier!,
        lifecycle: row.lifecycle,
        capabilities: row.capabilities as unknown as ModelCapabilities,
        price: config.price,
        priority: row.priority,
        approved: row.taskApprovals.length > 0,
        config,
      };
    });
    const override = task.override ? (catalog.find((entry) => entry.config.id === task.override!.modelConfigId)?.key ?? null) : null;
    return { task, policy: task.policy as unknown as TaskPolicyFields, catalog, override };
  }

  private health(config: RegisteredModelConfig): EntryHealth {
    if (!this.gateway.providerFor(config.provider)) return "NO_PROVIDER";
    return this.gateway.isUsable(config) ? "USABLE" : "BLOCKED";
  }
}
