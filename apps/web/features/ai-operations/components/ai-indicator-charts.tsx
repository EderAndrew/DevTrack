"use client";

import type { AiAgentMetrics, AiModelUsage } from "@repo/contracts";
import { Ban, CircleCheck, CircleX, TimerOff } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, seriesColor } from "@/components/ui/chart";
import { cost } from "./format";

const numbers = new Intl.NumberFormat("pt-BR");
const amounts = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

/** Height of a horizontal bar chart: one band per category plus the axis. */
const heightFor = (categories: number) => categories * 40 + 48;

/** The outcomes of an execution, in a fixed order (completed and timed out never side by side), with the 006 status icons. */
const OUTCOMES = {
  completed: {
    label: "Concluídas",
    color: "var(--success)",
    icon: CircleCheck,
  },
  failed: { label: "Falhas", color: "var(--danger)", icon: CircleX },
  timedOut: {
    label: "Tempo esgotado",
    color: "var(--warning)",
    icon: TimerOff,
  },
  cancelled: { label: "Canceladas", color: "var(--text-secondary)", icon: Ban },
} satisfies ChartConfig;
type Outcome = keyof typeof OUTCOMES;
const OUTCOME_KEYS = Object.keys(OUTCOMES) as Outcome[];

/** The chart is a summary: every number is in the table right below it. */
const TABLE_NOTE = "Os números de cada item estão na tabela abaixo.";

const COST = {
  estimatedCost: { label: "Custo estimado", color: "var(--chart-1)" },
} satisfies ChartConfig;

function ChartFigure({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <figure aria-labelledby={id} className="m-0 mb-6 flex flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <h3 id={id} className="m-0 text-h3">
          {title}
        </h3>
        <p className="m-0 text-body-sm text-text-secondary">{TABLE_NOTE}</p>
      </figcaption>
      {children}
    </figure>
  );
}

/**
 * "Execuções por agente" (006 amendment 2026-10-22): one bar per agent in the period, its executions
 * stacked by outcome; the agent's versions and models add up. Nothing without executions (the table
 * says so).
 */
export function AiExecutionsChart({ rows }: { rows: AiAgentMetrics[] }) {
  const byAgent = new Map<string, Record<Outcome, number> & { agentKey: string }>();
  for (const row of rows) {
    const agent = byAgent.get(row.agentKey) ?? {
      agentKey: row.agentKey,
      completed: 0,
      failed: 0,
      timedOut: 0,
      cancelled: 0,
    };
    for (const key of OUTCOME_KEYS) agent[key] += row[key];
    byAgent.set(row.agentKey, agent);
  }
  const data = [...byAgent.values()].filter((agent) => OUTCOME_KEYS.some((key) => agent[key] > 0));
  if (data.length === 0) return null;
  return (
    <ChartFigure title="Execuções por agente">
      <ChartContainer config={OUTCOMES} height={heightFor(data.length)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          title="Execuções por agente"
          desc={TABLE_NOTE}
        >
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => numbers.format(value)}
          />
          <YAxis type="category" dataKey="agentKey" width={160} interval={0} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent formatValue={(value) => numbers.format(value)} />} />
          {OUTCOME_KEYS.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="execucoes"
              fill={seriesColor(key)}
              stroke="var(--background)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </ChartFigure>
  );
}

/**
 * "Custo estimado por modelo" (006 amendment 2026-10-22): one bar per model with a cost in the
 * period, the most expensive first. Only when every cost is in one currency; otherwise only the table.
 */
export function AiCostChart({ rows }: { rows: AiModelUsage[] }) {
  const priced = rows.filter((row) => row.estimatedCost !== null);
  const currencies = new Set(priced.map((row) => row.currency));
  if (priced.length === 0 || currencies.size > 1) return null;
  const [currency] = [...currencies];
  const byModel = new Map<string, number>();
  for (const row of priced) byModel.set(row.model, (byModel.get(row.model) ?? 0) + Number(row.estimatedCost));
  const data = [...byModel.entries()]
    .map(([model, estimatedCost]) => ({ model, estimatedCost }))
    .sort((a, b) => b.estimatedCost - a.estimatedCost);
  return (
    <ChartFigure title="Custo estimado por modelo">
      <ChartContainer config={COST} height={heightFor(data.length)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          title="Custo estimado por modelo"
          desc={TABLE_NOTE}
        >
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value: number) => amounts.format(value)} />
          <YAxis type="category" dataKey="model" width={200} interval={0} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent formatValue={(value) => cost(String(value), currency ?? null)} />} />
          <Bar dataKey="estimatedCost" fill={seriesColor("estimatedCost")} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </ChartFigure>
  );
}
