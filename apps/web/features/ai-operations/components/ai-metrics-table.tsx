import type { AiAgentMetrics } from "@repo/contracts";
import { ChartNoAxesColumn } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { count, duration } from "./format";

/** "Indicadores": one row per agent, version, instructions and model in the period (006/US7-1). */
export function AiMetricsTable({ rows }: { rows: AiAgentMetrics[] }) {
  if (rows.length === 0) return <EmptyState icon={ChartNoAxesColumn} headingLevel="h3" title="Nenhuma execução no período." />;
  return (
    <Table>
      <TableCaption className="sr-only">Indicadores por agente</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Agente</TableHead>
          <TableHead scope="col">Versão</TableHead>
          <TableHead scope="col">Instruções</TableHead>
          <TableHead scope="col">Modelo</TableHead>
          <TableHead scope="col">Execuções</TableHead>
          <TableHead scope="col">Concluídas</TableHead>
          <TableHead scope="col">Falhas</TableHead>
          <TableHead scope="col">Tempo esgotado</TableHead>
          <TableHead scope="col">Canceladas</TableHead>
          <TableHead scope="col">Duração média</TableHead>
          <TableHead scope="col">Chamadas ao modelo</TableHead>
          <TableHead scope="col">Chamadas de ferramenta</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.agentKey}:${row.agentVersion}:${row.promptVersion}:${row.provider}:${row.model}`}>
            <TableCell>{row.agentKey}</TableCell>
            <TableCell>{row.agentVersion}</TableCell>
            <TableCell>{row.promptVersion}</TableCell>
            <TableCell>
              {row.provider} / {row.model}
            </TableCell>
            <TableCell>{count(row.executions)}</TableCell>
            <TableCell>{count(row.completed)}</TableCell>
            <TableCell>{count(row.failed)}</TableCell>
            <TableCell>{count(row.timedOut)}</TableCell>
            <TableCell>{count(row.cancelled)}</TableCell>
            <TableCell>{duration(row.avgDurationMs)}</TableCell>
            <TableCell>{count(row.modelCalls)}</TableCell>
            <TableCell>{count(row.toolCalls)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
