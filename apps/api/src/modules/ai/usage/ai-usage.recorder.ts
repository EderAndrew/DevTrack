import { Injectable } from "@nestjs/common";
import type { AiErrorCode } from "@repo/contracts";
import type { AiCallStatus } from "../../../generated/prisma/client";
import type { Tx } from "../../../platform/database/transaction";
import type { ModelUsage } from "../definitions/types";
import type { RegisteredModelConfig } from "../registry/ai-model-config.registry";
import { estimateCost } from "./cost";

export interface ModelCallRecord {
  executionId: string;
  sequence: number;
  config: RegisteredModelConfig;
  status: Extract<AiCallStatus, "SUCCEEDED" | "FAILED" | "TIMED_OUT">;
  attempts: number;
  errorCode: AiErrorCode | null;
  startedAt: Date;
  durationMs: number;
  usage: ModelUsage | null;
}

/**
 * One row of `ai_model_calls` per call to the model, failed ones included (006 FR-059, research
 * A16). Tokens only as the provider reported them; cost only with tokens and a price.
 */
@Injectable()
export class AiUsageRecorder {
  async record(tx: Tx, call: ModelCallRecord): Promise<void> {
    const cost = estimateCost(call.usage, call.config.price);
    await tx.aiModelCall.create({
      data: {
        executionId: call.executionId,
        sequence: call.sequence,
        modelConfigId: call.config.id,
        provider: call.config.provider,
        model: call.config.model,
        status: call.status,
        attempts: Math.max(1, call.attempts),
        errorCode: call.errorCode,
        startedAt: call.startedAt,
        durationMs: call.durationMs,
        inputTokens: call.usage?.inputTokens ?? null,
        outputTokens: call.usage?.outputTokens ?? null,
        totalTokens: call.usage?.totalTokens ?? null,
        estimatedCost: cost?.amount ?? null,
        currency: cost?.currency ?? null,
      },
    });
  }
}
