import { Inject, Injectable } from "@nestjs/common";
import type { AiAgentStatus, AiRiskLevel } from "@repo/contracts";
import { PrismaService } from "../../../platform/database/prisma.service";
import { AI_DEFINITIONS, type AgentDefinition, type AiDefinitions } from "../definitions/types";

/** The current version of an agent: database identity and status, plus its definition in code. */
export interface RegisteredAgent {
  id: string;
  key: string;
  name: string;
  status: AiAgentStatus;
  versionId: string;
  version: number;
  riskLevel: AiRiskLevel;
  requiredPermission: string;
  promptVersionId: string;
  promptVersion: number;
  outputSchemaVersionId: string | null;
  outputSchemaVersion: number | null;
  /** The task of the version (008); null only for a version synced before 008. */
  taskId: string | null;
  /** The model config of a version synced before 008; null since then. */
  modelConfigId: string | null;
  resourceTypes: string[];
  toolKeys: string[];
  /** Zod schemas, prompt text and hooks live in code (research A4). */
  definition: AgentDefinition;
}

/**
 * Reads agents from the synced registry. An agent whose code definition is gone (DEPRECATED)
 * or that has no current version is not returned.
 */
@Injectable()
export class AiAgentRegistry {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions,
  ) {}

  async byKey(key: string): Promise<RegisteredAgent | null> {
    const definition = this.definitions.agents.find((agent) => agent.key === key);
    if (!definition) return null;
    const row = await this.prisma.aiAgent.findUnique({
      where: { key },
      include: {
        currentVersion: {
          include: {
            promptVersion: { select: { version: true } },
            outputSchema: { select: { version: true } },
            tools: { select: { tool: { select: { key: true } } } },
          },
        },
      },
    });
    const version = row?.currentVersion;
    if (!row || !version) return null;
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      status: row.status,
      versionId: version.id,
      version: version.version,
      riskLevel: version.riskLevel,
      requiredPermission: version.requiredPermission,
      promptVersionId: version.promptVersionId,
      promptVersion: version.promptVersion.version,
      outputSchemaVersionId: version.outputSchemaVersionId,
      outputSchemaVersion: version.outputSchema?.version ?? null,
      taskId: version.taskId,
      modelConfigId: version.modelConfigId,
      resourceTypes: version.resourceTypes,
      toolKeys: version.tools.map((t) => t.tool.key).sort(),
      definition,
    };
  }
}
