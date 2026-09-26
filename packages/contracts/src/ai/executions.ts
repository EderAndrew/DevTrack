import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { AiErrorCodeSchema, AiExecutionStatusSchema, AiRiskLevelSchema } from "./enums.js";

// AI executions of the session teacher (006 contracts/http-api.md). Strict: unknown fields → 400,
// including any workspace, teacher or owner id — the workspace comes from the session (006/FR-029).

/** The resource an execution targets, e.g. `{type: "SUBJECT", id}`. */
export const AiResourceRefSchema = z.strictObject({
  type: z.string().regex(/^[A-Z][A-Z_]{1,39}$/),
  id: UuidSchema,
});
export type AiResourceRef = z.infer<typeof AiResourceRefSchema>;

export const RequestAiExecutionRequestSchema = z.strictObject({
  agentKey: z.string().min(1).max(63),
  resource: AiResourceRefSchema.optional(),
  /** Validated by the agent's own input schema on the server; size-limited (006/FR-048). */
  input: z.record(z.string(), z.unknown()).optional(),
  /** One per user intent; the same key returns the same execution (006/FR-025). */
  idempotencyKey: UuidSchema,
});
export type RequestAiExecutionRequest = z.infer<typeof RequestAiExecutionRequestSchema>;

export const AiAgentRefSchema = z.strictObject({
  key: z.string(),
  name: z.string(),
  version: z.int(),
});
export type AiAgentRef = z.infer<typeof AiAgentRefSchema>;

export const AiExecutionTransitionSchema = z.strictObject({
  from: AiExecutionStatusSchema.nullable(),
  to: AiExecutionStatusSchema,
  at: IsoDateTimeSchema,
});
export type AiExecutionTransition = z.infer<typeof AiExecutionTransitionSchema>;

const AiExecutionFieldsSchema = z.strictObject({
  id: UuidSchema,
  agent: AiAgentRefSchema,
  status: AiExecutionStatusSchema,
  riskLevel: AiRiskLevelSchema,
  resource: AiResourceRefSchema.nullable(),
  errorCode: AiErrorCodeSchema.nullable(),
  /** Cancellation asked while running; it ends at the next step (006/FR-027). */
  cancelRequested: z.boolean(),
  proposalId: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  startedAt: IsoDateTimeSchema.nullable(),
  completedAt: IsoDateTimeSchema.nullable(),
  failedAt: IsoDateTimeSchema.nullable(),
  durationMs: z.int().nullable(),
});

/** Never the provider, model, instructions, input or provider messages (006/FR-026). */
export const AiExecutionViewSchema = AiExecutionFieldsSchema.extend({
  transitions: z.array(AiExecutionTransitionSchema),
});
export type AiExecutionView = z.infer<typeof AiExecutionViewSchema>;

export const AiExecutionSummarySchema = AiExecutionFieldsSchema;
export type AiExecutionSummary = z.infer<typeof AiExecutionSummarySchema>;

/** Validated output of a completed L1 execution. */
export const AiExecutionResultSchema = z.strictObject({
  executionId: UuidSchema,
  schemaVersion: z.int(),
  output: z.unknown(),
});
export type AiExecutionResult = z.infer<typeof AiExecutionResultSchema>;

export const AiExecutionListQuerySchema = z.strictObject({
  status: AiExecutionStatusSchema.optional(),
  agentKey: z.string().min(1).max(63).optional(),
  cursor: z.string().max(200).optional(),
});
export type AiExecutionListQuery = z.infer<typeof AiExecutionListQuerySchema>;

/** Keyset page, newest first; `nextCursor` is opaque to the web. */
export const AiExecutionPageSchema = z.strictObject({
  items: z.array(AiExecutionSummarySchema),
  nextCursor: z.string().nullable(),
});
export type AiExecutionPage = z.infer<typeof AiExecutionPageSchema>;
