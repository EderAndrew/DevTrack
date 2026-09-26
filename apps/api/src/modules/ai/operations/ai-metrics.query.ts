import type { AiAgentMetrics, AiMetricsPeriod, AiModelUsage } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";

const HOUR = 3_600_000;
export const PERIOD_MS: Record<AiMetricsPeriod, number> = { "24h": 24 * HOUR, "7d": 7 * 24 * HOUR, "30d": 30 * 24 * HOUR };

/**
 * Aggregates for the administrator (006 research A20, FR-060): counters by agent, version,
 * prompt version, provider and model, and usage by provider and model. Only ids, versions,
 * statuses, counters, tokens and cost are read — never `input`, `output`, `payload`,
 * `workspace_id`, `resource_id` or user ids (FR-031). Cost is summed as `numeric` and returned as
 * a decimal string. Per agent (007 research C12.5, FR-048) also the output validation failures,
 * the proposals by status, and the average tokens and cost per execution; since 008 (FR-019) the
 * task and the executions that used the fallback.
 */
export async function queryAgentMetrics(db: Tx, from: Date, to: Date): Promise<AiAgentMetrics[]> {
  const rows = await db.$queryRaw<
    {
      agent_key: string;
      agent_version: number;
      prompt_version: number;
      provider: string;
      model: string;
      task_key: string | null;
      executions: bigint;
      completed: bigint;
      failed: bigint;
      timed_out: bigint;
      cancelled: bigint;
      fallbacks: bigint;
      avg_duration_ms: number | null;
      model_calls: bigint;
      tool_calls: bigint;
      output_invalid: bigint;
      proposals_created: bigint;
      proposals_approved: bigint;
      proposals_partially_approved: bigint;
      proposals_rejected: bigint;
      proposals_expired: bigint;
      avg_total_tokens: number | null;
      avg_estimated_cost: string | null;
      currency: string | null;
    }[]
  >`
    WITH usage AS (
      SELECT execution_id,
             SUM(total_tokens) AS total_tokens,
             SUM(estimated_cost) AS estimated_cost,
             CASE WHEN COUNT(DISTINCT currency) = 1 THEN MIN(currency) END AS currency
      FROM ai_model_calls
      GROUP BY execution_id
    )
    SELECT e.agent_key, e.agent_version, e.prompt_version, e.provider, e.model, e.task_key,
           COUNT(*) AS executions,
           COUNT(*) FILTER (WHERE e.status = 'COMPLETED') AS completed,
           COUNT(*) FILTER (WHERE e.status = 'FAILED') AS failed,
           COUNT(*) FILTER (WHERE e.status = 'TIMED_OUT') AS timed_out,
           COUNT(*) FILTER (WHERE e.status = 'CANCELLED') AS cancelled,
           COUNT(*) FILTER (WHERE e.fallback_used) AS fallbacks,
           ROUND(AVG(e.duration_ms))::int AS avg_duration_ms,
           COALESCE(SUM(e.model_calls), 0) AS model_calls,
           COALESCE(SUM(e.tool_calls), 0) AS tool_calls,
           COUNT(*) FILTER (WHERE e.status = 'FAILED' AND e.error_code IN ('AI_OUTPUT_PARSE_FAILED', 'AI_OUTPUT_VALIDATION_FAILED')) AS output_invalid,
           COUNT(p.id) AS proposals_created,
           COUNT(p.id) FILTER (WHERE p.status = 'APPROVED') AS proposals_approved,
           COUNT(p.id) FILTER (WHERE p.status = 'PARTIALLY_APPROVED') AS proposals_partially_approved,
           COUNT(p.id) FILTER (WHERE p.status = 'REJECTED') AS proposals_rejected,
           COUNT(p.id) FILTER (WHERE p.status = 'EXPIRED' OR (p.status = 'READY_FOR_REVIEW' AND p.expires_at <= now())) AS proposals_expired,
           ROUND(AVG(u.total_tokens))::int AS avg_total_tokens,
           ROUND(AVG(u.estimated_cost), 6)::text AS avg_estimated_cost,
           CASE WHEN COUNT(DISTINCT u.currency) = 1 THEN MIN(u.currency) END AS currency
    FROM ai_executions e
    LEFT JOIN usage u ON u.execution_id = e.id
    LEFT JOIN ai_proposals p ON p.execution_id = e.id
    WHERE e.created_at >= ${from}::timestamptz AND e.created_at < ${to}::timestamptz
    GROUP BY e.agent_key, e.agent_version, e.prompt_version, e.provider, e.model, e.task_key
    ORDER BY e.agent_key, e.agent_version, e.prompt_version, e.provider, e.model, e.task_key`;
  return rows.map((row) => ({
    agentKey: row.agent_key,
    agentVersion: row.agent_version,
    promptVersion: row.prompt_version,
    provider: row.provider,
    model: row.model,
    taskKey: row.task_key,
    executions: Number(row.executions),
    completed: Number(row.completed),
    failed: Number(row.failed),
    timedOut: Number(row.timed_out),
    cancelled: Number(row.cancelled),
    fallbacks: Number(row.fallbacks),
    avgDurationMs: row.avg_duration_ms,
    modelCalls: Number(row.model_calls),
    toolCalls: Number(row.tool_calls),
    outputInvalid: Number(row.output_invalid),
    proposals: {
      created: Number(row.proposals_created),
      approved: Number(row.proposals_approved),
      partiallyApproved: Number(row.proposals_partially_approved),
      rejected: Number(row.proposals_rejected),
      expired: Number(row.proposals_expired),
    },
    avgTotalTokens: row.avg_total_tokens,
    avgEstimatedCost: row.avg_estimated_cost,
    currency: row.currency?.trim() ?? null,
  }));
}

/**
 * Usage by provider and model (006), by the served model when the provider reported it (008
 * FR-019), with the failed calls, the fallback calls and the average duration.
 */
export async function queryModelUsage(db: Tx, from: Date, to: Date): Promise<AiModelUsage[]> {
  const rows = await db.$queryRaw<
    {
      provider: string;
      model: string;
      calls: bigint;
      failed_calls: bigint;
      fallback_calls: bigint;
      avg_duration_ms: number | null;
      input_tokens: bigint | null;
      output_tokens: bigint | null;
      total_tokens: bigint | null;
      estimated_cost: string | null;
      currency: string | null;
    }[]
  >`
    SELECT provider, COALESCE(served_model, model) AS model,
           COUNT(*) AS calls,
           COUNT(*) FILTER (WHERE status <> 'SUCCEEDED') AS failed_calls,
           COUNT(*) FILTER (WHERE is_fallback) AS fallback_calls,
           ROUND(AVG(duration_ms))::int AS avg_duration_ms,
           SUM(input_tokens) AS input_tokens,
           SUM(output_tokens) AS output_tokens,
           SUM(total_tokens) AS total_tokens,
           SUM(estimated_cost)::text AS estimated_cost,
           CASE WHEN COUNT(DISTINCT currency) = 1 THEN MIN(currency) END AS currency
    FROM ai_model_calls
    WHERE started_at >= ${from}::timestamptz AND started_at < ${to}::timestamptz
    GROUP BY provider, COALESCE(served_model, model)
    ORDER BY provider, COALESCE(served_model, model)`;
  const toInt = (value: bigint | null) => (value === null ? null : Number(value));
  return rows.map((row) => ({
    provider: row.provider,
    model: row.model,
    calls: Number(row.calls),
    failedCalls: Number(row.failed_calls),
    fallbackCalls: Number(row.fallback_calls),
    avgDurationMs: row.avg_duration_ms,
    inputTokens: toInt(row.input_tokens),
    outputTokens: toInt(row.output_tokens),
    totalTokens: toInt(row.total_tokens),
    estimatedCost: row.estimated_cost,
    currency: row.currency?.trim() ?? null,
  }));
}
