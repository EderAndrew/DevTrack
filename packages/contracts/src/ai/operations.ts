import { z } from "zod";
import { IsoDateTimeSchema } from "../common/primitives.js";
import { AiAgentStatusSchema, AiModelConfigStatusSchema, AiRiskLevelSchema } from "./enums.js";

// AI operations for the administrator (006 contracts/http-api.md, US7): aggregates and
// configuration only — never pedagogical content, resources, users, prompts or credentials.

export const AiProviderStatusSchema = z.enum(["UP", "DOWN", "NOT_CONFIGURED"]);
export type AiProviderStatus = z.infer<typeof AiProviderStatusSchema>;

export const AiHealthSchema = z.strictObject({
  checkedAt: IsoDateTimeSchema,
  modelConfigs: z.array(
    z.strictObject({
      key: z.string(),
      provider: z.string(),
      model: z.string(),
      status: AiModelConfigStatusSchema,
      providerStatus: AiProviderStatusSchema,
    }),
  ),
});
export type AiHealth = z.infer<typeof AiHealthSchema>;

export const AiMetricsPeriodSchema = z.enum(["24h", "7d", "30d"]);
export type AiMetricsPeriod = z.infer<typeof AiMetricsPeriodSchema>;

export const AiMetricsQuerySchema = z.strictObject({ period: AiMetricsPeriodSchema.default("7d") });
export type AiMetricsQuery = z.infer<typeof AiMetricsQuerySchema>;

/** A decimal amount as a string, so no precision is lost on the wire. */
const DecimalStringSchema = z.string().regex(/^\d+(\.\d+)?$/);

export const AiAgentMetricsSchema = z.strictObject({
  agentKey: z.string(),
  agentVersion: z.int(),
  promptVersion: z.int(),
  provider: z.string(),
  model: z.string(),
  executions: z.int(),
  completed: z.int(),
  failed: z.int(),
  timedOut: z.int(),
  cancelled: z.int(),
  avgDurationMs: z.int().nullable(),
  modelCalls: z.int(),
  toolCalls: z.int(),
  /** Failed because the model's output did not parse or did not fit the schema (007 research C12.5). */
  outputInvalid: z.int(),
  /** Proposals of these executions by status; an undecided one past its validity counts as expired. */
  proposals: z.strictObject({
    created: z.int(),
    approved: z.int(),
    partiallyApproved: z.int(),
    rejected: z.int(),
    expired: z.int(),
  }),
  /** Per execution with model calls: the sum of its calls' tokens, then the average. */
  avgTotalTokens: z.int().nullable(),
  avgEstimatedCost: DecimalStringSchema.nullable(),
  currency: z.string().nullable(),
});
export type AiAgentMetrics = z.infer<typeof AiAgentMetricsSchema>;

export const AiModelUsageSchema = z.strictObject({
  provider: z.string(),
  model: z.string(),
  calls: z.int(),
  inputTokens: z.int().nullable(),
  outputTokens: z.int().nullable(),
  totalTokens: z.int().nullable(),
  estimatedCost: DecimalStringSchema.nullable(),
  currency: z.string().nullable(),
});
export type AiModelUsage = z.infer<typeof AiModelUsageSchema>;

export const AiMetricsSchema = z.strictObject({
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
  byAgent: z.array(AiAgentMetricsSchema),
  byModel: z.array(AiModelUsageSchema),
});
export type AiMetrics = z.infer<typeof AiMetricsSchema>;

export const AiAgentOperationsViewSchema = z.strictObject({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  status: AiAgentStatusSchema,
  version: z.int(),
  riskLevel: AiRiskLevelSchema,
  modelConfigKey: z.string(),
  promptVersion: z.int(),
  outputSchemaVersion: z.int().nullable(),
  toolKeys: z.array(z.string()),
  queued: z.int(),
  running: z.int(),
});
export type AiAgentOperationsView = z.infer<typeof AiAgentOperationsViewSchema>;

export const AiModelConfigViewSchema = z.strictObject({
  key: z.string(),
  provider: z.string(),
  model: z.string(),
  status: AiModelConfigStatusSchema,
  maxOutputTokens: z.int(),
  timeoutMs: z.int(),
  hasPrice: z.boolean(),
  agentKeys: z.array(z.string()),
});
export type AiModelConfigView = z.infer<typeof AiModelConfigViewSchema>;

/** Key of an agent or model config in the registry (a code identifier such as `reference-l1`). */
export const AiRegistryKeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,62}$/);

/** Only ACTIVE ⇄ DISABLED through the API; DRAFT and DEPRECATED come from code. */
export const ChangeAiAgentStatusRequestSchema = z.strictObject({ status: z.enum(["ACTIVE", "DISABLED"]) });
export type ChangeAiAgentStatusRequest = z.infer<typeof ChangeAiAgentStatusRequestSchema>;

export const ChangeAiModelConfigStatusRequestSchema = z.strictObject({ status: AiModelConfigStatusSchema });
export type ChangeAiModelConfigStatusRequest = z.infer<typeof ChangeAiModelConfigStatusRequestSchema>;
