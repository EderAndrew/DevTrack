import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../platform/database/prisma.service";
import type { GatewayModelConfig } from "../gateway/model-gateway";

export interface RegisteredModelConfig extends GatewayModelConfig {
  id: string;
  price: { inputPerMTok: string; outputPerMTok: string; currency: string } | null;
}

/** Reads model configs as the database holds them (status is operational, research A4). */
@Injectable()
export class AiModelConfigRegistry {
  constructor(private readonly prisma: PrismaService) {}

  async byId(id: string): Promise<RegisteredModelConfig | null> {
    const row = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      key: row.key,
      provider: row.provider,
      model: row.model,
      status: row.status,
      parameters: row.parameters as GatewayModelConfig["parameters"],
      maxOutputTokens: row.maxOutputTokens,
      timeoutMs: row.timeoutMs,
      price:
        row.inputPricePerMTok && row.outputPricePerMTok && row.currency
          ? { inputPerMTok: row.inputPricePerMTok.toString(), outputPerMTok: row.outputPricePerMTok.toString(), currency: row.currency }
          : null,
    };
  }
}
