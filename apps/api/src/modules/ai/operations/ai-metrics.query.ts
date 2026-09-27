import type { AiAgentMetrics, AiFamilyMetrics, AiMetricsPeriod, AiModelTier, AiModelUsage, AiTaskMetrics, AiTierMetrics } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";

const HOUR = 3_600_000;
export const PERIOD_MS: Record<AiMetricsPeriod, number> = { "24h": 24 * HOUR, "7d": 7 * 24 * HOUR, "30d": 30 * 24 * HOUR };

const toInt = (value: bigint | null) => (value === null ? null : Number(value));

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
      escalations: bigint;
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
           COUNT(*) FILTER (WHERE e.escalation_used) AS escalations,
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
    escalations: Number(row.escalations),
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
 * FR-019), with the failed calls, the fallback calls and the average duration; since 009 also by
 * the tier and family the call's catalog entry had (kept on the call, research H14).
 */
export async function queryModelUsage(db: Tx, from: Date, to: Date): Promise<AiModelUsage[]> {
  const rows = await db.$queryRaw<
    {
      provider: string;
      model: string;
      tier: AiModelTier | null;
      family: string | null;
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
    SELECT provider, COALESCE(served_model, model) AS model, tier::text AS tier, family,
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
    GROUP BY provider, COALESCE(served_model, model), tier, family
    ORDER BY provider, COALESCE(served_model, model), tier, family`;
  return rows.map((row) => ({
    provider: row.provider,
    model: row.model,
    tier: row.tier,
    family: row.family,
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

/** Calls of the period grouped by one column of `ai_model_calls`, with tokens, latency and cost. */
interface CallTotals {
  calls: bigint;
  input_tokens: bigint | null;
  output_tokens: bigint | null;
  avg_duration_ms: number | null;
  estimated_cost: string | null;
  currency: string | null;
}

const totals = (row: CallTotals) => ({
  calls: Number(row.calls),
  inputTokens: toInt(row.input_tokens),
  outputTokens: toInt(row.output_tokens),
  avgDurationMs: row.avg_duration_ms,
  estimatedCost: row.estimated_cost,
  currency: row.currency?.trim() ?? null,
});

/**
 * Usage by task (009 FR-020): the executions of each task in the period, the agents that ran
 * them, their calls (every leg, fallback and escalation included) and how many used a fallback or
 * an escalation. Executions before 008 have no task and are left out.
 */
export async function queryTaskMetrics(db: Tx, from: Date, to: Date): Promise<AiTaskMetrics[]> {
  const rows = await db.$queryRaw<(CallTotals & { task_key: string; agent_keys: string[]; executions: bigint; fallbacks: bigint; escalations: bigint })[]>`
    WITH calls AS (
      SELECT execution_id,
             COUNT(*) AS calls,
             SUM(input_tokens) AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             SUM(duration_ms) AS duration_ms,
             SUM(estimated_cost) AS estimated_cost,
             -- One currency, or '*' when the calls of one execution mixed them.
             CASE WHEN COUNT(DISTINCT currency) = 1 THEN MIN(currency) WHEN COUNT(DISTINCT currency) > 1 THEN '*' END AS currency
      FROM ai_model_calls
      GROUP BY execution_id
    )
    SELECT e.task_key,
           array_agg(DISTINCT e.agent_key ORDER BY e.agent_key) AS agent_keys,
           COUNT(*) AS executions,
           COALESCE(SUM(c.calls), 0) AS calls,
           SUM(c.input_tokens) AS input_tokens,
           SUM(c.output_tokens) AS output_tokens,
           ROUND(SUM(c.duration_ms)::numeric / NULLIF(SUM(c.calls), 0))::int AS avg_duration_ms,
           SUM(c.estimated_cost)::text AS estimated_cost,
           CASE WHEN COUNT(DISTINCT c.currency) = 1 AND MIN(c.currency) <> '*' THEN MIN(c.currency) END AS currency,
           COUNT(*) FILTER (WHERE e.fallback_used) AS fallbacks,
           COUNT(*) FILTER (WHERE e.escalation_used) AS escalations
    FROM ai_executions e
    LEFT JOIN calls c ON c.execution_id = e.id
    WHERE e.task_key IS NOT NULL AND e.created_at >= ${from}::timestamptz AND e.created_at < ${to}::timestamptz
    GROUP BY e.task_key
    ORDER BY e.task_key`;
  return rows.map((row) => ({
    taskKey: row.task_key,
    agentKeys: row.agent_keys,
    executions: Number(row.executions),
    ...totals(row),
    fallbacks: Number(row.fallbacks),
    escalations: Number(row.escalations),
  }));
}

/** Calls by tier (009 FR-020); null groups the calls from before 009. */
export async function queryTierMetrics(db: Tx, from: Date, to: Date): Promise<AiTierMetrics[]> {
  const rows = await db.$queryRaw<(CallTotals & { tier: AiModelTier | null })[]>`
    SELECT tier::text AS tier, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
           ROUND(AVG(duration_ms))::int AS avg_duration_ms, SUM(estimated_cost)::text AS estimated_cost,
           CASE WHEN COUNT(DISTINCT currency) = 1 THEN MIN(currency) END AS currency
    FROM ai_model_calls
    WHERE started_at >= ${from}::timestamptz AND started_at < ${to}::timestamptz
    GROUP BY tier
    ORDER BY tier NULLS LAST`;
  return rows.map((row) => ({ tier: row.tier, ...totals(row) }));
}

/** Calls by family (009 FR-020), with the fallback calls; null groups the calls from before 009. */
export async function queryFamilyMetrics(db: Tx, from: Date, to: Date): Promise<AiFamilyMetrics[]> {
  const rows = await db.$queryRaw<(CallTotals & { family: string | null; fallback_calls: bigint })[]>`
    SELECT family, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
           ROUND(AVG(duration_ms))::int AS avg_duration_ms, SUM(estimated_cost)::text AS estimated_cost,
           CASE WHEN COUNT(DISTINCT currency) = 1 THEN MIN(currency) END AS currency,
           COUNT(*) FILTER (WHERE is_fallback) AS fallback_calls
    FROM ai_model_calls
    WHERE started_at >= ${from}::timestamptz AND started_at < ${to}::timestamptz
    GROUP BY family
    ORDER BY family NULLS LAST`;
  return rows.map((row) => ({ family: row.family, ...totals(row), fallbackCalls: Number(row.fallback_calls) }));
}

/**
 * Real average cost per execution of each model × task in the period (009 FR-021): the cost of the
 * calls an execution of the task made to the model, averaged over those executions; only the
 * executions whose calls to it all have a cost count.
 */
export async function queryModelTaskCost(db: Tx, from: Date, to: Date): Promise<Map<string, string>> {
  const rows = await db.$queryRaw<{ model_config_id: string; task_key: string; avg_cost: string | null }[]>`
    WITH per_execution AS (
      SELECT c.model_config_id, e.task_key, e.id,
             SUM(c.estimated_cost) AS cost,
             bool_and(c.estimated_cost IS NOT NULL) AS priced
      FROM ai_model_calls c
      JOIN ai_executions e ON e.id = c.execution_id
      WHERE e.task_key IS NOT NULL AND e.created_at >= ${from}::timestamptz AND e.created_at < ${to}::timestamptz
      GROUP BY c.model_config_id, e.task_key, e.id
    )
    SELECT model_config_id, task_key, ROUND(AVG(cost) FILTER (WHERE priced), 6)::text AS avg_cost
    FROM per_execution
    GROUP BY model_config_id, task_key`;
  return new Map(rows.filter((row) => row.avg_cost !== null).map((row) => [`${row.model_config_id}|${row.task_key}`, row.avg_cost!]));
}
