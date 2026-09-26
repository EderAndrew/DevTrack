import type { Logger } from "@nestjs/common";

/**
 * Fields an AI log line may carry (006 FR-061, research A20): ids, versions, status, counters,
 * usage and codes — never prompts, inputs, outputs, documents or credentials.
 */
export interface AiLogFields {
  executionId?: string;
  correlationId?: string;
  agentKey?: string;
  agentVersion?: number;
  promptVersion?: number;
  status?: string;
  step?: string;
  durationMs?: number;
  provider?: string;
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string;
  toolKey?: string;
  attempts?: number;
  /** Paths (never values) of an output that failed its schema. */
  issuePaths?: string[];
  errorName?: string;
  /** The task of the execution and the config, served model and leg of one call (008 FR-019). */
  task?: string | null;
  configKey?: string;
  servedModel?: string | null;
  fallback?: boolean;
}

const ALLOWED: ReadonlySet<string> = new Set<keyof AiLogFields>([
  "executionId",
  "correlationId",
  "agentKey",
  "agentVersion",
  "promptVersion",
  "status",
  "step",
  "durationMs",
  "provider",
  "model",
  "inputTokens",
  "outputTokens",
  "errorCode",
  "toolKey",
  "attempts",
  "issuePaths",
  "errorName",
  "task",
  "configKey",
  "servedModel",
  "fallback",
]);

/** Keeps only the allowed fields, whatever the caller passes at runtime. */
export function aiLogFields(fields: AiLogFields): AiLogFields {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => ALLOWED.has(key) && value !== undefined)) as AiLogFields;
}

export function aiLog(logger: Logger, event: string, fields: AiLogFields, level: "log" | "warn" | "error" = "log"): void {
  logger[level](aiLogFields(fields), event);
}
