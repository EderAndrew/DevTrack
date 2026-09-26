import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { PrismaService } from "../../../platform/database/prisma.service";
import { advisoryXactLock, LockKey, type Tx } from "../../../platform/database/transaction";
import { AuditService } from "../../audit/audit.service";
import { AI_DEFINITIONS, type AgentDefinition, type AiDefinitions, type TaskUnavailableReason } from "../definitions/types";
import {
  AiRegistryError,
  agentVersionHash,
  checkDefinitions,
  jsonSchemaOf,
  modelConfigHash,
  outputSchemaHash,
  promptHash,
  taskHash,
  toolHash,
} from "./ai-definitions.check";

export interface AiRegistrySummary {
  agents: number;
  tools: number;
  modelConfigs: number;
  tasks: number;
  newVersions: number;
  deprecated: number;
  changed: boolean;
}

/**
 * Records the AI definitions of code in the database at startup (006 FR-008, research A4, A5),
 * once across instances (advisory lock). Idempotent: syncing twice changes nothing. The status
 * of agents and configs comes from code only on insert; afterwards it is operational, so a
 * DISABLED agent stays disabled. An agent missing from code becomes DEPRECATED. A used version
 * (`used_at`) whose content changed in code stops the startup: publish a new version instead.
 */
@Injectable()
export class AiRegistrySync implements OnApplicationBootstrap {
  private readonly logger = new Logger("AiRegistry");

  constructor(
    @Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sync();
  }

  async sync(): Promise<AiRegistrySummary> {
    checkDefinitions(this.definitions, this.config.ai.limits);
    const summary = await this.prisma.runInTransaction(
      async (tx) => {
        await advisoryXactLock(tx, LockKey.AI_REGISTRY);
        const changes = { count: 0, newVersions: 0, deprecated: 0 };
        const configIds = await this.syncModelConfigs(tx, changes);
        const taskIds = await this.syncTasks(tx, configIds, changes);
        const toolIds = await this.syncTools(tx, changes);
        for (const agent of this.definitions.agents) await this.syncAgent(tx, agent, taskIds, toolIds, changes);
        changes.deprecated = await this.deprecateMissing(tx);
        changes.count += changes.deprecated;

        const result: AiRegistrySummary = {
          agents: this.definitions.agents.length,
          tools: this.definitions.tools.length,
          modelConfigs: this.definitions.modelConfigs.length,
          tasks: this.definitions.tasks.length,
          newVersions: changes.newVersions,
          deprecated: changes.deprecated,
          changed: changes.count > 0,
        };
        if (result.changed) {
          const { changed: _changed, ...metadata } = result;
          await this.audit.record(tx, { type: "ai_registry.synced", actorType: "SYSTEM", metadata });
        }
        return result;
      },
      { timeoutMs: 30_000 },
    );
    this.logger.log({ agents: summary.agents, newVersions: summary.newVersions, deprecated: summary.deprecated }, "ai.registry_synced");
    this.reportUnavailableTasks();
    return summary;
  }

  /**
   * One warning per task that can't run with this deploy's definitions (008 FR-008): the reason
   * code only, never a model value, key or secret. The API keeps running.
   */
  private reportUnavailableTasks(): void {
    const configs = new Map(this.definitions.modelConfigs.map((config) => [config.key, config]));
    const providers = new Set(this.definitions.providers.map((provider) => provider.key));
    for (const task of this.definitions.tasks) {
      const route = [task.primaryModelConfigKey, task.fallbackModelConfigKey].flatMap((key) => (key ? [configs.get(key)!] : []));
      const reason: TaskUnavailableReason | null =
        route.find((config) => config.unavailableReason)?.unavailableReason ??
        (route.some((config) => providers.has(config.provider)) ? null : "PROVIDER_NOT_REGISTERED");
      if (reason) this.logger.warn({ task: task.key, reason }, "ai.task_unavailable");
    }
  }

  private async syncModelConfigs(tx: Tx, changes: { count: number }): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const config of this.definitions.modelConfigs) {
      const hash = modelConfigHash(config);
      const fields = {
        provider: config.provider,
        model: config.model,
        parameters: (config.parameters ?? {}) as Prisma.InputJsonObject,
        maxOutputTokens: config.maxOutputTokens,
        timeoutMs: config.timeoutMs,
        inputPricePerMTok: config.price?.inputPerMTok ?? null,
        outputPricePerMTok: config.price?.outputPerMTok ?? null,
        currency: config.price?.currency ?? null,
        definitionHash: hash,
      };
      const existing = await tx.aiModelConfig.findUnique({ where: { key: config.key }, select: { id: true, definitionHash: true, model: true } });
      if (!existing) {
        const created = await tx.aiModelConfig.create({ data: { key: config.key, status: config.initialStatus, ...fields }, select: { id: true } });
        ids.set(config.key, created.id);
        changes.count += 1;
      } else {
        if (existing.definitionHash !== hash) {
          await tx.aiModelConfig.update({ where: { id: existing.id }, data: fields });
          changes.count += 1;
          // Each call keeps the model it used; this is the history of the config (008 research G3).
          if (existing.model !== config.model) {
            await this.audit.record(tx, {
              type: "ai_model_config.changed",
              actorType: "SYSTEM",
              targetType: "AI_MODEL_CONFIG",
              targetId: existing.id,
              metadata: { configKey: config.key, provider: config.provider, previousModel: existing.model, model: config.model },
            });
          }
        }
        ids.set(config.key, existing.id);
      }
    }
    return ids;
  }

  /** Tasks after the configs they route to (008 research G2); mutable rows, like the configs. */
  private async syncTasks(tx: Tx, configIds: Map<string, string>, changes: { count: number }): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const task of this.definitions.tasks) {
      const hash = taskHash(task);
      const fields = {
        primaryModelConfigId: configIds.get(task.primaryModelConfigKey)!,
        fallbackModelConfigId: task.fallbackModelConfigKey ? configIds.get(task.fallbackModelConfigKey)! : null,
        parameters: (task.parameters ?? {}) as Prisma.InputJsonObject,
        maxOutputTokens: task.maxOutputTokens,
        timeoutMs: task.timeoutMs,
        definitionHash: hash,
      };
      const existing = await tx.aiTask.findUnique({ where: { key: task.key }, select: { id: true, definitionHash: true } });
      if (!existing) {
        const created = await tx.aiTask.create({ data: { key: task.key, ...fields }, select: { id: true } });
        ids.set(task.key, created.id);
        changes.count += 1;
      } else {
        if (existing.definitionHash !== hash) {
          await tx.aiTask.update({ where: { id: existing.id }, data: fields });
          changes.count += 1;
        }
        ids.set(task.key, existing.id);
      }
    }
    return ids;
  }

  private async syncTools(tx: Tx, changes: { count: number }): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const tool of this.definitions.tools) {
      const hash = toolHash(tool);
      const fields = {
        name: tool.name,
        description: tool.description,
        riskLevel: tool.riskLevel,
        timeoutMs: tool.timeoutMs,
        requiredPermission: tool.requiredPermission,
        resourceType: tool.resourceType,
        inputJsonSchema: jsonSchemaOf(tool.inputSchema) as Prisma.InputJsonObject,
        outputFields: outputFields(tool.outputSchema),
        definitionHash: hash,
      };
      const existing = await tx.aiTool.findUnique({ where: { key: tool.key }, select: { id: true, definitionHash: true } });
      if (!existing) {
        const created = await tx.aiTool.create({ data: { key: tool.key, status: tool.initialStatus, ...fields }, select: { id: true } });
        ids.set(tool.key, created.id);
        changes.count += 1;
      } else {
        if (existing.definitionHash !== hash) {
          await tx.aiTool.update({ where: { id: existing.id }, data: fields });
          changes.count += 1;
        }
        ids.set(tool.key, existing.id);
      }
    }
    return ids;
  }

  private async syncAgent(
    tx: Tx,
    agent: AgentDefinition,
    taskIds: Map<string, string>,
    toolIds: Map<string, string>,
    changes: { count: number; newVersions: number },
  ): Promise<void> {
    let row = await tx.aiAgent.findUnique({ where: { key: agent.key }, select: { id: true, status: true, name: true, description: true, currentVersionId: true } });
    if (!row) {
      row = await tx.aiAgent.create({
        data: { key: agent.key, name: agent.name, description: agent.description, status: agent.initialStatus },
        select: { id: true, status: true, name: true, description: true, currentVersionId: true },
      });
      changes.count += 1;
    } else if (row.name !== agent.name || row.description !== agent.description || row.status === "DEPRECATED") {
      await tx.aiAgent.update({
        where: { id: row.id },
        data: { name: agent.name, description: agent.description, ...(row.status === "DEPRECATED" ? { status: agent.initialStatus } : {}) },
      });
      changes.count += 1;
    }
    const agentId = row.id;

    const promptId = await this.upsertVersioned(
      tx,
      `prompt "${agent.prompt.key}" v${agent.prompt.version} of agent "${agent.key}"`,
      () => tx.aiPromptVersion.findUnique({ where: { agentId_key_version: { agentId, key: agent.prompt.key, version: agent.prompt.version } } }),
      (existing) => existing.contentHash === promptHash(agent),
      () =>
        tx.aiPromptVersion.create({
          data: {
            agentId,
            key: agent.prompt.key,
            version: agent.prompt.version,
            systemInstructions: agent.prompt.systemInstructions,
            contentHash: promptHash(agent),
            status: agent.prompt.status,
          },
        }),
      (existing) =>
        tx.aiPromptVersion.update({
          where: { id: existing.id },
          data: { systemInstructions: agent.prompt.systemInstructions, contentHash: promptHash(agent), status: agent.prompt.status },
        }),
      changes,
    );
    // The prompt status may change without a new version (e.g. DEPRECATED).
    await tx.aiPromptVersion.updateMany({ where: { id: promptId, NOT: { status: agent.prompt.status } }, data: { status: agent.prompt.status } });

    let outputId: string | null = null;
    if (agent.output) {
      const output = agent.output;
      const hash = outputSchemaHash(agent)!;
      outputId = await this.upsertVersioned(
        tx,
        `output schema v${output.version} of agent "${agent.key}"`,
        () => tx.aiOutputSchemaVersion.findUnique({ where: { agentId_version: { agentId, version: output.version } } }),
        (existing) => existing.schemaHash === hash,
        () =>
          tx.aiOutputSchemaVersion.create({
            data: { agentId, version: output.version, jsonSchema: jsonSchemaOf(output.schema) as Prisma.InputJsonObject, schemaHash: hash },
          }),
        (existing) =>
          tx.aiOutputSchemaVersion.update({
            where: { id: existing.id },
            data: { jsonSchema: jsonSchemaOf(output.schema) as Prisma.InputJsonObject, schemaHash: hash },
          }),
        changes,
      );
    }

    const hash = agentVersionHash(agent);
    const versionFields = {
      riskLevel: agent.riskLevel,
      executionMode: "ASYNC" as const,
      requiredPermission: agent.requiredPermission,
      promptVersionId: promptId,
      outputSchemaVersionId: outputId,
      // Versions synced since 008 route through their task; `model_config_id` stays for older ones.
      taskId: taskIds.get(agent.taskKey)!,
      modelConfigId: null,
      resourceTypes: agent.resourceTypes,
      proposalType: agent.proposal?.type ?? null,
      limits: (agent.limits ?? {}) as Prisma.InputJsonObject,
      onToolDenied: agent.onToolDenied ?? "fail",
      definitionHash: hash,
    };
    const toolRows = agent.toolKeys.map((key) => ({ toolId: toolIds.get(key)! }));
    const versionId = await this.upsertVersioned(
      tx,
      `version ${agent.version} of agent "${agent.key}"`,
      () => tx.aiAgentVersion.findUnique({ where: { agentId_version: { agentId, version: agent.version } } }),
      (existing) => existing.definitionHash === hash,
      async () => {
        const created = await tx.aiAgentVersion.create({ data: { agentId, version: agent.version, ...versionFields } });
        await tx.aiAgentTool.createMany({ data: toolRows.map((t) => ({ ...t, agentVersionId: created.id })) });
        return created;
      },
      async (existing) => {
        const updated = await tx.aiAgentVersion.update({ where: { id: existing.id }, data: versionFields });
        await tx.aiAgentTool.deleteMany({ where: { agentVersionId: existing.id } });
        await tx.aiAgentTool.createMany({ data: toolRows.map((t) => ({ ...t, agentVersionId: existing.id })) });
        return updated;
      },
      changes,
    );
    if (row.currentVersionId !== versionId) {
      await tx.aiAgent.update({ where: { id: agentId }, data: { currentVersionId: versionId } });
      changes.count += 1;
    }
  }

  /** Inserts a version, keeps it when unchanged, updates it only while unused (FR-010). */
  private async upsertVersioned<T extends { id: string; usedAt: Date | null }>(
    _tx: Tx,
    label: string,
    find: () => Promise<T | null>,
    same: (existing: T) => boolean,
    create: () => Promise<{ id: string }>,
    update: (existing: T) => Promise<{ id: string }>,
    changes: { count: number; newVersions: number },
  ): Promise<string> {
    const existing = await find();
    if (!existing) {
      const created = await create();
      changes.count += 1;
      changes.newVersions += 1;
      return created.id;
    }
    if (same(existing)) return existing.id;
    if (existing.usedAt) throw new AiRegistryError(`${label} was already used and changed in code; publish a new version`);
    await update(existing);
    changes.count += 1;
    return existing.id;
  }

  private async deprecateMissing(tx: Tx): Promise<number> {
    const keys = this.definitions.agents.map((agent) => agent.key);
    const { count } = await tx.aiAgent.updateMany({
      where: { key: { notIn: keys }, status: { not: "DEPRECATED" } },
      data: { status: "DEPRECATED" },
    });
    return count;
  }
}

/** Top-level field names of a strict object schema: what the tool returns (FR-036). */
function outputFields(schema: AgentDefinition["input"]): string[] {
  const json = schema ? (jsonSchemaOf(schema) as { properties?: Record<string, unknown> }) : {};
  return Object.keys(json.properties ?? {}).sort();
}
