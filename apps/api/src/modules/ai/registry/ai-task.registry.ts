import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../platform/database/prisma.service";
import type { GatewayTask } from "../gateway/model-gateway";
import { type RegisteredModelConfig, toRegisteredModelConfig } from "./ai-model-config.registry";

export interface RegisteredTask extends GatewayTask {
  id: string;
  key: string;
}

/** Where a task sends its calls: the primary config and the optional fallback (008 research G2, G5). */
export interface RegisteredRoute {
  /** null for an agent version synced before 008, which names its model config directly. */
  task: RegisteredTask | null;
  primary: RegisteredModelConfig;
  fallback: RegisteredModelConfig | null;
}

/** Reads tasks and their routes as the database holds them; the configs' status is operational. */
@Injectable()
export class AiTaskRegistry {
  constructor(private readonly prisma: PrismaService) {}

  async byKey(key: string): Promise<RegisteredTask | null> {
    const row = await this.prisma.aiTask.findUnique({ where: { key } });
    return row ? toTask(row) : null;
  }

  /** The route of an agent version: through its task, or its own model config before 008. */
  async routeOf(version: { taskId: string | null; modelConfigId: string | null }): Promise<RegisteredRoute | null> {
    if (version.taskId) {
      const row = await this.prisma.aiTask.findUnique({
        where: { id: version.taskId },
        include: { primaryModelConfig: true, fallbackModelConfig: true },
      });
      if (!row) return null;
      return {
        task: toTask(row),
        primary: toRegisteredModelConfig(row.primaryModelConfig),
        fallback: row.fallbackModelConfig ? toRegisteredModelConfig(row.fallbackModelConfig) : null,
      };
    }
    if (!version.modelConfigId) return null;
    const config = await this.prisma.aiModelConfig.findUnique({ where: { id: version.modelConfigId } });
    return config ? { task: null, primary: toRegisteredModelConfig(config), fallback: null } : null;
  }
}

function toTask(row: { id: string; key: string; parameters: unknown; maxOutputTokens: number; timeoutMs: number }): RegisteredTask {
  return {
    id: row.id,
    key: row.key,
    parameters: row.parameters as GatewayTask["parameters"],
    maxOutputTokens: row.maxOutputTokens,
    timeoutMs: row.timeoutMs,
  };
}
