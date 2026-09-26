import type { AiAgentMetrics, AiMetricsPeriod, AiModelUsage } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";

const HOUR = 3_600_000;
export const PERIOD_MS: Record<AiMetricsPeriod, number> = { "24h": 24 * HOUR, "7d": 7 * 24 * HOUR, "30d": 30 * 24 * HOUR };

/**
 * Aggregates for the administrator (006 research A20, FR-060): counters by agent, version,
 * prompt version, provider and model, and usage by provider and model. Only ids, versions,
 * statuses, counters, tokens and cost are read — never `input`, `output`, `payload`,
 * `workspace_id`, `resource_id` or user ids (FR-031). Cost is summed as `numeric` and returned as
 * a decimal string.
 */
export async function queryAgentMetrics(db: Tx, from: Date, to: Date): Promise<AiAgentMetrics[]> {
  const rows = await db.$queryRaw<
    {
      agent_key: string;
      agent_version: number;
      prompt_version: number;
      provider: string;
      model: string;
      executions: bigint;
      completed: bigint;
      failed: bigint;
      timed_out: bigint;
      cancelled: bigint;
      avg_duration_ms: number | null;
      model_calls: bigint;
      tool_calls: bigint;
    }[]
  >`
    SELECT agent_key, agent_version, prompt_version, provider, model,
           COUNT(*) AS executions,
           COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
           COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
           COUNT(*) FILTER (WHERE status = 'TIMED_OUT') AS timed_out,
           COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
           ROUND(AVG(duration_ms))::int AS avg_duration_ms,
           COALESCE(SUM(model_calls), 0) AS model_calls,
           COALESCE(SUM(tool_calls), 0) AS tool_calls
    FROM ai_executions
    WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
    GROUP BY agent_key, agent_version, prompt_version, provider, model
    ORDER BY agent_key, agent_version, prompt_version, provider, model`;
  return rows.map((row) => ({
    agentKey: row.agent_key,
    agentVersion: row.agent_version,
    promptVersion: row.prompt_version,
    provider: row.provider,
    model: row.model,
    executions: Number(row.executions),
    completed: Number(row.completed),
    failed: Number(row.failed),
    timedOut: Number(row.timed_out),
    cancelled: Number(row.cancelled),
    avgDurationMs: row.avg_duration_ms,
    modelCalls: Number(row.model_calls),
    toolCalls: Number(row.tool_calls),
  }));
}

export async function queryModelUsage(db: Tx, from: Date, to: Date): Promise<AiModelUsage[]> {
  const rows = await db.$queryRaw<
    {
      provider: string;
      model: string;
      calls: bigint;
      input_tokens: bigint | null;
      output_tokens: bigint | null;
      total_tokens: bigint | null;
      estimated_cost: string | null;
      currency: string | null;
    }[]
  >`
    SELECT provider, model,
           COUNT(*) AS calls,
           SUM(input_tokens) AS input_tokens,
           SUM(output_tokens) AS output_tokens,
           SUM(total_tokens) AS total_tokens,
           SUM(estimated_cost)::text AS estimated_cost,
           CASE WHEN COUNT(DISTINCT currency) = 1 THEN MIN(currency) END AS currency
    FROM ai_model_calls
    WHERE started_at >= ${from}::timestamptz AND started_at < ${to}::timestamptz
    GROUP BY provider, model
    ORDER BY provider, model`;
  const toInt = (value: bigint | null) => (value === null ? null : Number(value));
  return rows.map((row) => ({
    provider: row.provider,
    model: row.model,
    calls: Number(row.calls),
    inputTokens: toInt(row.input_tokens),
    outputTokens: toInt(row.output_tokens),
    totalTokens: toInt(row.total_tokens),
    estimatedCost: row.estimated_cost,
    currency: row.currency?.trim() ?? null,
  }));
}
