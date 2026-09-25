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
import { AiHealthTable } from "./ai-health-table";
import { AiMetricsTable } from "./ai-metrics-table";
import { AiModelConfigsTable } from "./ai-model-configs-table";
import { AiUsageTable } from "./ai-usage-table";

const PERIODS: Record<AiMetricsPeriod, string> = {
  "24h": "Últimas 24 horas",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

/**
 * "Operação de IA" (006 US7, contracts/web-ui.md): health, indicators, usage and cost, agents and
 * model configs. Only aggregates and configuration reach this screen — never teachers' content.
 */
export function AiOperationsPage({ canManage }: { canManage: boolean }) {
  const [period, setPeriod] = useState<AiMetricsPeriod>("7d");
  const metrics = useAiMetrics(period);

  return (
    <div className="flex flex-col gap-8">
      <AiHealthTable />

      <section aria-labelledby="ia-indicadores">
        <h2 id="ia-indicadores">Indicadores</h2>
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
        {metrics.isError ? (
          <Alert variant="danger" className="mb-4">
            <AlertDescription>{messageForError(metrics.error)}</AlertDescription>
          </Alert>
        ) : null}
        {metrics.isPending ? <Skeleton className="h-24 w-full" /> : metrics.data ? <AiMetricsTable rows={metrics.data.byAgent} /> : null}
      </section>

      <section aria-labelledby="ia-uso">
        <h2 id="ia-uso">Uso e custo</h2>
        {metrics.isPending ? <Skeleton className="h-24 w-full" /> : metrics.data ? <AiUsageTable rows={metrics.data.byModel} /> : null}
      </section>

      <AiAgentsTable canManage={canManage} />
      <AiModelConfigsTable canManage={canManage} />
    </div>
  );
}
