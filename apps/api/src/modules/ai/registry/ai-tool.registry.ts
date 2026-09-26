import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../platform/database/prisma.service";
import { AI_DEFINITIONS, type AiDefinitions, type AnyToolDefinition } from "../definitions/types";

export interface RegisteredTool {
  id: string;
  key: string;
  enabled: boolean;
  definition: AnyToolDefinition;
}

/** Reads tools from the synced registry; a key unknown to code or to the database is `null`. */
@Injectable()
export class AiToolRegistry {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions,
  ) {}

  async byKey(key: string): Promise<RegisteredTool | null> {
    const definition = this.definitions.tools.find((tool) => tool.key === key);
    if (!definition) return null;
    const row = await this.prisma.aiTool.findUnique({ where: { key }, select: { id: true, status: true } });
    if (!row) return null;
    return { id: row.id, key, enabled: row.status === "ENABLED", definition };
  }
}
