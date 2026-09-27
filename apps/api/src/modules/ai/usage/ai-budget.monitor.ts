import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AiBudgetScope } from "@repo/contracts";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { CryptoService } from "../../../platform/crypto/crypto.service";
import type { Tx } from "../../../platform/database/transaction";
import { AuditService } from "../../audit/audit.service";
import { planningToday } from "../../class-plans/planning-date";

/** Days and months of the budgets (009 research H16): the same São Paulo calendar as the class plan. */
export const BUDGET_TIME_ZONE = "America/Sao_Paulo";

/** Budgets are in USD; a cost in another currency is not summed. */
const BUDGET_CURRENCY = "USD";

interface BudgetCheck {
  scope: AiBudgetScope;
  limit: string;
  /** "YYYY-MM-DD" (DAILY) or "YYYY-MM" (the monthly scopes). */
  period: string;
  /** First day of the period, the alert's key. */
  periodStart: string;
  /** Row key of `ai_budget_alerts`: `PER_AGENT:<key>` for an agent. */
  alertScope: string;
  /** HMAC of the user for PER_USER (never the id in clear), else `-`. */
  subjectHash: string;
  agentKey: string | null;
  /** SQL filter of the calls that count, besides the period. */
  where: "all" | "agent" | "user";
}

/**
 * The observable budgets (009 FR-022, research H16). After each recorded model call, in its
 * transaction, sums the USD cost of the affected budgets' periods from `ai_model_calls`; the first
 * crossing of a budget in its period inserts the `ai_budget_alerts` row and audits
 * `ai_budget.exceeded` — once, since later crossings find the row. Never blocks anything (spec Q3):
 * the per-execution, per-user and per-agent limits keep bounding consumption (FR-023).
 */
@Injectable()
export class AiBudgetMonitor {
  private readonly logger = new Logger("AiBudget");

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /** Checks the budgets a call of `executionId` made at `at` counts toward. */
  async afterCall(tx: Tx, executionId: string, at: Date): Promise<void> {
    const budgets = this.config.ai.budgets;
    if (!budgets.daily && !budgets.monthly && !budgets.perAgentMonthly && !budgets.perUserMonthly) return;
    // One check at a time: a concurrent call's row is committed before the next sum reads it, so
    // simultaneous executions can't both miss the crossing (the alert's key dedupes the event).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ai-budget'))`;
    const [execution] = await tx.$queryRaw<{ agent_key: string; requested_by_user_id: string }[]>`
      SELECT agent_key, requested_by_user_id FROM ai_executions WHERE id = ${executionId}::uuid`;
    if (!execution) return;

    const day = planningToday(at);
    const month = day.slice(0, 7);
    const daily = { period: day, periodStart: day };
    const monthly = { period: month, periodStart: `${month}-01` };
    const checks: BudgetCheck[] = [];
    if (budgets.daily) checks.push({ scope: "DAILY", limit: budgets.daily, ...daily, alertScope: "DAILY", subjectHash: "-", agentKey: null, where: "all" });
    if (budgets.monthly) checks.push({ scope: "MONTHLY", limit: budgets.monthly, ...monthly, alertScope: "MONTHLY", subjectHash: "-", agentKey: null, where: "all" });
    if (budgets.perAgentMonthly) {
      const agentKey = execution.agent_key;
      checks.push({ scope: "PER_AGENT", limit: budgets.perAgentMonthly, ...monthly, alertScope: `PER_AGENT:${agentKey}`, subjectHash: "-", agentKey, where: "agent" });
    }
    if (budgets.perUserMonthly) {
      const subjectHash = this.crypto.hmacKey("ai-budget-user", execution.requested_by_user_id);
      checks.push({ scope: "PER_USER", limit: budgets.perUserMonthly, ...monthly, alertScope: "PER_USER", subjectHash, agentKey: null, where: "user" });
    }

    for (const check of checks) {
      const spent = await spentIn(tx, check, execution);
      if (!spent.reached) continue;
      const inserted = await tx.$executeRaw`
        INSERT INTO ai_budget_alerts (scope, period_start, subject_hash)
        VALUES (${check.alertScope}, ${check.periodStart}::date, ${check.subjectHash})
        ON CONFLICT DO NOTHING`;
      if (inserted === 0) continue;
      await this.audit.record(tx, {
        type: "ai_budget.exceeded",
        actorType: "SYSTEM",
        metadata: { scope: check.scope, period: check.period, limit: check.limit, spent: spent.amount, agentKey: check.agentKey },
      });
      this.logger.warn({ scope: check.scope, period: check.period, agentKey: check.agentKey }, "ai.budget_exceeded");
    }
  }
}

/** USD spent in the check's period (São Paulo calendar) and whether it reached the limit. */
async function spentIn(tx: Tx, check: BudgetCheck, execution: { agent_key: string; requested_by_user_id: string }): Promise<{ amount: string; reached: boolean }> {
  const unit = check.scope === "DAILY" ? "day" : "month";
  const agent = check.where === "agent" ? execution.agent_key : null;
  const user = check.where === "user" ? execution.requested_by_user_id : null;
  const [row] = await tx.$queryRaw<{ amount: string; reached: boolean }[]>`
    SELECT round(coalesce(sum(c.estimated_cost), 0), 6)::text AS amount,
           coalesce(sum(c.estimated_cost), 0) >= ${check.limit}::numeric AS reached
      FROM ai_model_calls c
      JOIN ai_executions e ON e.id = c.execution_id
     WHERE c.currency = ${BUDGET_CURRENCY}
       AND c.estimated_cost IS NOT NULL
       AND date_trunc(${unit}, c.started_at AT TIME ZONE ${BUDGET_TIME_ZONE})::date = ${check.periodStart}::date
       AND (${agent}::text IS NULL OR e.agent_key = ${agent})
       AND (${user}::uuid IS NULL OR e.requested_by_user_id = ${user}::uuid)`;
  return row!;
}
