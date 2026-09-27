import { z } from "zod";
import { IsoDateTimeSchema } from "../common/primitives.js";
import {
  AiAgentStatusSchema,
  AiModelConfigStatusSchema,
  AiModelLifecycleSchema,
  AiModelModeSchema,
  AiModelTierSchema,
  AiRiskLevelSchema,
  AiSelectionReasonSchema,
  AiTaskUnavailableReasonSchema,
} from "./enums.js";

// AI operations for the administrator (006 contracts/http-api.md, US7): aggregates and
// configuration only — never pedagogical content, resources, users, prompts or credentials.

export const AiProviderStatusSchema = z.enum(["UP", "DOWN", "NOT_CONFIGURED"]);
export type AiProviderStatus = z.infer<typeof AiProviderStatusSchema>;

/** State of a model config's circuit on the answering API instance (008 research G8). */
export const AiCircuitStateSchema = z.enum(["CLOSED", "OPEN", "HALF_OPEN"]);
export type AiCircuitState = z.infer<typeof AiCircuitStateSchema>;

export const AiHealthSchema = z.strictObject({
  checkedAt: IsoDateTimeSchema,
  modelConfigs: z.array(
    z.strictObject({
      key: z.string(),
      provider: z.string(),
      model: z.string(),
      status: AiModelConfigStatusSchema,
      providerStatus: AiProviderStatusSchema,
      circuit: AiCircuitStateSchema,
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
  /** The task the executions ran (008); null for versions before it. */
  taskKey: z.string().nullable(),
  executions: z.int(),
  completed: z.int(),
  failed: z.int(),
  timedOut: z.int(),
  cancelled: z.int(),
  /** Executions in which a logical call went to the fallback model (008 FR-019). */
  fallbacks: z.int(),
  /** Executions escalated to a higher tier after an invalid output (009 FR-015). */
  escalations: z.int(),
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
  /** The model the provider served when it said so, else the one requested (008 FR-019). */
  model: z.string(),
  /** Tier and family of the catalog entry the calls went to (009); null before 009. */
  tier: AiModelTierSchema.nullable(),
  family: z.string().nullable(),
  calls: z.int(),
  /** Calls that did not succeed (failed or timed out). */
  failedCalls: z.int(),
  /** Calls made by the fallback leg. */
  fallbackCalls: z.int(),
  avgDurationMs: z.int().nullable(),
  inputTokens: z.int().nullable(),
  outputTokens: z.int().nullable(),
  totalTokens: z.int().nullable(),
  estimatedCost: DecimalStringSchema.nullable(),
  currency: z.string().nullable(),
});
export type AiModelUsage = z.infer<typeof AiModelUsageSchema>;

/** Usage of one task in the period (009 FR-020): its executions and their calls. */
export const AiTaskMetricsSchema = z.strictObject({
  taskKey: z.string(),
  agentKeys: z.array(z.string()),
  executions: z.int(),
  calls: z.int(),
  inputTokens: z.int().nullable(),
  outputTokens: z.int().nullable(),
  avgDurationMs: z.int().nullable(),
  estimatedCost: DecimalStringSchema.nullable(),
  currency: z.string().nullable(),
  fallbacks: z.int(),
  escalations: z.int(),
});
export type AiTaskMetrics = z.infer<typeof AiTaskMetricsSchema>;

/** Calls by the tier of their catalog entry (009 FR-020); null for calls before 009. */
export const AiTierMetricsSchema = z.strictObject({
  tier: AiModelTierSchema.nullable(),
  calls: z.int(),
  inputTokens: z.int().nullable(),
  outputTokens: z.int().nullable(),
  avgDurationMs: z.int().nullable(),
  estimatedCost: DecimalStringSchema.nullable(),
  currency: z.string().nullable(),
});
export type AiTierMetrics = z.infer<typeof AiTierMetricsSchema>;

/** Calls by the family of their catalog entry (009 FR-020); null for calls before 009. */
export const AiFamilyMetricsSchema = z.strictObject({
  family: z.string().nullable(),
  calls: z.int(),
  inputTokens: z.int().nullable(),
  outputTokens: z.int().nullable(),
  avgDurationMs: z.int().nullable(),
  estimatedCost: DecimalStringSchema.nullable(),
  currency: z.string().nullable(),
  fallbackCalls: z.int(),
});
export type AiFamilyMetrics = z.infer<typeof AiFamilyMetricsSchema>;

export const AiMetricsSchema = z.strictObject({
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
  byAgent: z.array(AiAgentMetricsSchema),
  byModel: z.array(AiModelUsageSchema),
  byTask: z.array(AiTaskMetricsSchema),
  byTier: z.array(AiTierMetricsSchema),
  byFamily: z.array(AiFamilyMetricsSchema),
});
export type AiMetrics = z.infer<typeof AiMetricsSchema>;

export const AiAgentOperationsViewSchema = z.strictObject({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  status: AiAgentStatusSchema,
  version: z.int(),
  riskLevel: AiRiskLevelSchema,
  /** The route of the current version (008): its task and the configs it routes to. */
  taskKey: z.string().nullable(),
  primaryModelConfigKey: z.string().nullable(),
  fallbackModelConfigKey: z.string().nullable(),
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

export const AiModelCapabilitiesSchema = z.strictObject({
  structuredOutput: z.boolean(),
  tools: z.boolean(),
  vision: z.boolean(),
  reasoning: z.boolean(),
});
export type AiModelCapabilities = z.infer<typeof AiModelCapabilitiesSchema>;

/**
 * One entry of the model catalog (009 FR-002, FR-021): its classification, reference price and,
 * per task, the approval with the metrics measured and the real average cost per execution in
 * the period (null without executions or without cost).
 */
export const AiModelCatalogViewSchema = z.strictObject({
  key: z.string(),
  family: z.string(),
  model: z.string(),
  tier: AiModelTierSchema,
  mode: AiModelModeSchema,
  lifecycle: AiModelLifecycleSchema,
  status: AiModelConfigStatusSchema,
  capabilities: AiModelCapabilitiesSchema,
  contextWindow: z.int().nullable(),
  price: z.strictObject({ inputPerMTok: DecimalStringSchema, outputPerMTok: DecimalStringSchema, currency: z.string() }).nullable(),
  approvals: z.array(
    z.strictObject({
      taskKey: z.string(),
      valid: z.boolean(),
      metrics: z.record(z.string(), z.number()),
      evaluatedAt: IsoDateTimeSchema,
      avgCostPerExecution: DecimalStringSchema.nullable(),
    }),
  ),
});
export type AiModelCatalogView = z.infer<typeof AiModelCatalogViewSchema>;

/**
 * One task with its policy and the policy's choice now (009 FR-006, FR-010): the primary and
 * fallback catalog keys and the reason (`DEPRECATED_ONLY` is the deprecated-in-use warning), or why
 * it is unavailable; and the administrator's override.
 */
export const AiTaskPolicyViewSchema = z.strictObject({
  key: z.string(),
  mode: AiModelModeSchema,
  minimumTier: AiModelTierSchema,
  preferredTier: AiModelTierSchema,
  maxTier: AiModelTierSchema,
  allowedFamilies: z.array(z.string()),
  requiredCapabilities: z.array(z.string()),
  fallback: z.enum(["SAME_TIER", "NONE"]),
  escalation: z.enum(["NONE", "ON_OUTPUT_INVALID"]),
  quality: z.record(z.string(), z.number()),
  agentKeys: z.array(z.string()),
  selection: z.union([
    z.strictObject({ primaryKey: z.string(), fallbackKey: z.string().nullable(), reason: AiSelectionReasonSchema }),
    z.strictObject({ unavailable: AiTaskUnavailableReasonSchema }),
  ]),
  override: z.strictObject({ modelConfigKey: z.string(), setAt: IsoDateTimeSchema }).nullable(),
});
export type AiTaskPolicyView = z.infer<typeof AiTaskPolicyViewSchema>;

/** Key of an agent or model config in the registry (a code identifier such as `reference-l1`). */
export const AiRegistryKeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,62}$/);

/** Only ACTIVE ⇄ DISABLED through the API; DRAFT and DEPRECATED come from code. */
export const ChangeAiAgentStatusRequestSchema = z.strictObject({ status: z.enum(["ACTIVE", "DISABLED"]) });
export type ChangeAiAgentStatusRequest = z.infer<typeof ChangeAiAgentStatusRequestSchema>;

export const ChangeAiModelConfigStatusRequestSchema = z.strictObject({ status: AiModelConfigStatusSchema });
export type ChangeAiModelConfigStatusRequest = z.infer<typeof ChangeAiModelConfigStatusRequestSchema>;
