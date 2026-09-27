import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../platform/database/prisma.service";
import type { GatewayTask } from "../gateway/model-gateway";

export interface RegisteredTask extends GatewayTask {
  id: string;
  key: string;
}

/**
 * Reads tasks as the database holds them (008 research G2). Which models a task runs on is the
 * policy's choice at request time (`AiPolicyRegistry`, 009), fixed on the execution.
 */
@Injectable()
export class AiTaskRegistry {
  constructor(private readonly prisma: PrismaService) {}

  async byKey(key: string): Promise<RegisteredTask | null> {
    const row = await this.prisma.aiTask.findUnique({ where: { key } });
    return row ? toRegisteredTask(row) : null;
  }
}

export function toRegisteredTask(row: { id: string; key: string; parameters: unknown; maxOutputTokens: number; timeoutMs: number }): RegisteredTask {
  return {
    id: row.id,
    key: row.key,
    parameters: row.parameters as GatewayTask["parameters"],
    maxOutputTokens: row.maxOutputTokens,
    timeoutMs: row.timeoutMs,
  };
}
