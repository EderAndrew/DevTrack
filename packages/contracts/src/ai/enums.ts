import { z } from "zod";

// Public enums of the AI foundation (006 contracts/http-api.md, "Shared types").

export const AiRiskLevelSchema = z.enum(["L1_READ_ONLY", "L2_PROPOSAL", "L3_ACTION"]);
export type AiRiskLevel = z.infer<typeof AiRiskLevelSchema>;

export const AiAgentStatusSchema = z.enum(["DRAFT", "ACTIVE", "DISABLED", "DEPRECATED"]);
export type AiAgentStatus = z.infer<typeof AiAgentStatusSchema>;

export const AiModelConfigStatusSchema = z.enum(["ENABLED", "DISABLED"]);
export type AiModelConfigStatus = z.infer<typeof AiModelConfigStatusSchema>;

export const AiExecutionStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "WAITING_TOOL",
  "VALIDATING_OUTPUT",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);
export type AiExecutionStatus = z.infer<typeof AiExecutionStatusSchema>;

/** Statuses an execution never leaves (006/FR-021). */
export const AI_FINAL_EXECUTION_STATUSES = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
] as const satisfies readonly AiExecutionStatus[];

export const AiProposalStatusSchema = z.enum([
  "READY_FOR_REVIEW",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "EXPIRED",
]);
export type AiProposalStatus = z.infer<typeof AiProposalStatusSchema>;

/**
 * Normalized AI error codes (006/FR-050), carried by `AiExecutionView.errorCode`. Only some of
 * them are also HTTP errors (see `ErrorCodeSchema`); the others never leave the execution record.
 */
export const AiErrorCodeSchema = z.enum([
  "AI_AGENT_NOT_FOUND",
  "AI_AGENT_DISABLED",
  "AI_MODEL_UNAVAILABLE",
  "AI_PROVIDER_ERROR",
  "AI_TIMEOUT",
  "AI_RATE_LIMITED",
  "AI_TOOL_NOT_ALLOWED",
  "AI_TOOL_EXECUTION_FAILED",
  "AI_OUTPUT_PARSE_FAILED",
  "AI_OUTPUT_VALIDATION_FAILED",
  "AI_CONTEXT_ACCESS_DENIED",
  "AI_EXECUTION_CANCELLED",
  "AI_EXECUTION_LIMIT_EXCEEDED",
]);
export type AiErrorCode = z.infer<typeof AiErrorCodeSchema>;
