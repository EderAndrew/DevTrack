import type { AiBudgetStatus } from "@repo/contracts";
import type { AppConfig } from "../../../platform/config/config.schema";
import type { Tx } from "../../../platform/database/transaction";
import { planningToday } from "../../class-plans/planning-date";
import { BUDGET_TIME_ZONE } from "../usage/ai-budget.monitor";

/**
 * Consumption against each budget in its current period (009 FR-022, research H16): the São Paulo
 * day and month of `now`, USD costs only, as `AiBudgetMonitor` sums them. DAILY, MONTHLY and
 * PER_USER always appear (limit null when not configured); PER_AGENT has a row per agent with
 * spending this month. PER_USER is one aggregate: never who, only how many are over.
 */
export async function queryBudgets(db: Tx, budgets: AppConfig["ai"]["budgets"], now: Date): Promise<AiBudgetStatus[]> {
  const day = planningToday(now);
  const monthStart = `${day.slice(0, 7)}-01`;
  const [totals] = await db.$queryRaw<{ daily: string; monthly: string }[]>`
    SELECT round(coalesce(sum(estimated_cost) FILTER (WHERE (started_at AT TIME ZONE ${BUDGET_TIME_ZONE})::date = ${day}::date), 0), 6)::text AS daily,
           round(coalesce(sum(estimated_cost), 0), 6)::text AS monthly
      FROM ai_model_calls
     WHERE currency = 'USD' AND estimated_cost IS NOT NULL
       AND date_trunc('month', started_at AT TIME ZONE ${BUDGET_TIME_ZONE})::date = ${monthStart}::date`;
  const perAgent = await db.$queryRaw<{ agent_key: string; spent: string }[]>`
    SELECT e.agent_key, round(sum(c.estimated_cost), 6)::text AS spent
      FROM ai_model_calls c JOIN ai_executions e ON e.id = c.execution_id
     WHERE c.currency = 'USD' AND c.estimated_cost IS NOT NULL
       AND date_trunc('month', c.started_at AT TIME ZONE ${BUDGET_TIME_ZONE})::date = ${monthStart}::date
     GROUP BY e.agent_key
     ORDER BY e.agent_key`;
  const [perUser] = await db.$queryRaw<{ spent: string; over: bigint }[]>`
    SELECT round(coalesce(sum(spent), 0), 6)::text AS spent,
           count(*) FILTER (WHERE ${budgets.perUserMonthly}::numeric IS NOT NULL AND spent >= ${budgets.perUserMonthly}::numeric) AS over
      FROM (SELECT sum(c.estimated_cost) AS spent
              FROM ai_model_calls c JOIN ai_executions e ON e.id = c.execution_id
             WHERE c.currency = 'USD' AND c.estimated_cost IS NOT NULL
               AND date_trunc('month', c.started_at AT TIME ZONE ${BUDGET_TIME_ZONE})::date = ${monthStart}::date
             GROUP BY e.requested_by_user_id) AS users`;

  const status = (scope: AiBudgetStatus["scope"], limit: string | null, spent: string, agentKey: string | null = null): AiBudgetStatus => ({
    scope,
    agentKey,
    limit,
    spent,
    exceeded: limit !== null && Number(spent) >= Number(limit),
    usersOverBudget: null,
  });
  const usersOver = budgets.perUserMonthly === null ? null : Number(perUser!.over);
  return [
    status("DAILY", budgets.daily, totals!.daily),
    status("MONTHLY", budgets.monthly, totals!.monthly),
    ...perAgent.map((row) => status("PER_AGENT", budgets.perAgentMonthly, row.spent, row.agent_key)),
    { ...status("PER_USER", budgets.perUserMonthly, perUser!.spent), exceeded: (usersOver ?? 0) > 0, usersOverBudget: usersOver },
  ];
}
