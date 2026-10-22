"use client";

import { type AiMetricsPeriod, AiMetricsPeriodSchema } from "@repo/contracts";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useAiMetrics } from "../hooks/use-ai-operations";
import { AiAgentsTable } from "./ai-agents-table";
import { AiBudgetsTable } from "./ai-budgets-table";
import { AiCostBreakdown } from "./ai-cost-breakdown";
import { AiHealthTable } from "./ai-health-table";
import { AiMetricsTable } from "./ai-metrics-table";
import { AiModelConfigsTable } from "./ai-model-configs-table";
import { AiModelsTable } from "./ai-models-table";
import { AiTasksTable } from "./ai-tasks-table";
import type { AiOperationsTab } from "./ai-operations-tabs";
import { AiUsageTable } from "./ai-usage-table";

const PERIODS: Record<AiMetricsPeriod, string> = {
  "24h": "Últimas 24 horas",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

/**
 * "Operação de IA" (006 US7, contracts/web-ui.md): health, indicators, usage and cost, agents and
 * model configs; since 009 (US6) the cost by task, tier and family, the task policies with the
 * model chosen now, and the model catalog with quality next to cost; the budgets (US8). Only aggregates and
 * configuration reach this screen — never teachers' content. Only the section of `?aba=` is shown:
 * the sub-items of the side menu's "Operação de IA" group are the navigation (006 amendment
 * 2026-10-22). Moving between sections keeps the page mounted, so the period carries over.
 */
export function AiOperationsPage({ canManage, tab = "saude" }: { canManage: boolean; tab?: AiOperationsTab }) {
  const [period, setPeriod] = useState<AiMetricsPeriod>("7d");
  const metrics = useAiMetrics(period);

  // One Select per section that uses the period; only one section is shown, so the id is unique.
  const periodSelect = (
    <div className="mb-4 flex flex-col gap-2">
      <Label htmlFor="ia-periodo">Período</Label>
      <Select value={period} onValueChange={(value) => setPeriod(AiMetricsPeriodSchema.parse(value))}>
        <SelectTrigger id="ia-periodo" className="min-h-11 w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AiMetricsPeriodSchema.options.map((option) => (
            <SelectItem key={option} value={option}>
              {PERIODS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  switch (tab) {
    case "saude":
      return <AiHealthTable />;
    case "indicadores":
      return (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="ia-indicadores">
            <h2 id="ia-indicadores">Indicadores</h2>
            {periodSelect}
            {metrics.isError ? (
              <Alert variant="danger" className="mb-4">
                <AlertDescription>{messageForError(metrics.error)}</AlertDescription>
              </Alert>
            ) : null}
            {metrics.isPending ? <Skeleton className="h-24 w-full" /> : metrics.data ? <AiMetricsTable rows={metrics.data.byAgent} /> : null}
          </section>

          <section aria-labelledby="ia-uso">
            <h2 id="ia-uso">Uso e custo</h2>
            {metrics.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : metrics.data ? (
              <div className="flex flex-col gap-4">
                <AiUsageTable rows={metrics.data.byModel} />
                <AiCostBreakdown byTask={metrics.data.byTask} byTier={metrics.data.byTier} byFamily={metrics.data.byFamily} />
              </div>
            ) : null}
          </section>
        </div>
      );
    case "orcamentos":
      return <AiBudgetsTable budgets={metrics.data?.budgets} />;
    case "tarefas":
      return <AiTasksTable canManage={canManage} />;
    case "modelos":
      return (
        <div>
          {periodSelect}
          <AiModelsTable period={period} />
        </div>
      );
    case "agentes":
      return <AiAgentsTable canManage={canManage} />;
    case "configuracoes":
      return <AiModelConfigsTable canManage={canManage} />;
  }
}
