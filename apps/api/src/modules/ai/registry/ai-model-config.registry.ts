import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../platform/database/prisma.service";
import type { ModelTier } from "../definitions/model-families";
import type { ModelPrice } from "../definitions/types";
import type { GatewayModelConfig } from "../gateway/model-gateway";

export interface RegisteredModelConfig extends GatewayModelConfig {
  id: string;
  price: ModelPrice | null;
  /** Catalog tier and family (009); null for a row no longer in the catalog. */
  tier: ModelTier | null;
  family: string | null;
}

/** A model config row as the gateway and the usage recorder need it; never a credential. */
export function toRegisteredModelConfig(row: Prisma.AiModelConfigGetPayload<object>): RegisteredModelConfig {
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
    tier: row.tier,
    family: row.family,
  };
}

/** Reads model configs as the database holds them (status is operational, research A4). */
@Injectable()
export class AiModelConfigRegistry {
  constructor(private readonly prisma: PrismaService) {}

  async byId(id: string): Promise<RegisteredModelConfig | null> {
    const row = await this.prisma.aiModelConfig.findUnique({ where: { id } });
    return row ? toRegisteredModelConfig(row) : null;
  }
}
