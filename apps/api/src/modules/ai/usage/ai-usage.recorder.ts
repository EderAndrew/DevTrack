import { Injectable } from "@nestjs/common";
import type { AiErrorCode } from "@repo/contracts";
import type { AiCallStatus } from "../../../generated/prisma/client";
import type { Tx } from "../../../platform/database/transaction";
import type { ModelUsage } from "../definitions/types";
import type { RegisteredModelConfig } from "../registry/ai-model-config.registry";
import { callCost } from "./cost";

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
  /** What the provider says it served (008 research G12). */
  servedModel: string | null;
  /** A leg of the route's fallback (008 research G6). */
  isFallback: boolean;
}

/**
 * One row of `ai_model_calls` per call to the model, failed ones included (006 FR-059, research
 * A16), and per leg of a route since 008. Tokens only as the provider reported them; the cost the
 * provider reported, else the estimate by the config's price, else none (008 research G17).
 */
@Injectable()
export class AiUsageRecorder {
  async record(tx: Tx, call: ModelCallRecord): Promise<void> {
    const cost = callCost(call.usage, call.config.price);
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
        costSource: cost?.source ?? null,
        servedModel: call.servedModel,
        isFallback: call.isFallback,
      },
    });
  }
}
