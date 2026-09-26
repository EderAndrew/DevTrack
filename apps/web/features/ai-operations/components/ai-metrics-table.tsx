import type { AiAgentMetrics } from "@repo/contracts";
import { ChartNoAxesColumn } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cost, count, countWithRate, duration } from "./format";

/**
 * "Indicadores": one row per agent, version, instructions and model in the period (006/US7-1), with
 * the rates of 007/FR-048 next to their counts: outcomes over executions, decisions over proposals.
 */
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
          <TableHead scope="col">Falhas de validação</TableHead>
          <TableHead scope="col">Propostas</TableHead>
          <TableHead scope="col">Aprovadas</TableHead>
          <TableHead scope="col">Aprovadas em parte</TableHead>
          <TableHead scope="col">Rejeitadas</TableHead>
          <TableHead scope="col">Tokens médios</TableHead>
          <TableHead scope="col">Custo médio</TableHead>
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
            <TableCell>{countWithRate(row.completed, row.executions)}</TableCell>
            <TableCell>{countWithRate(row.failed, row.executions)}</TableCell>
            <TableCell>{countWithRate(row.timedOut, row.executions)}</TableCell>
            <TableCell>{countWithRate(row.cancelled, row.executions)}</TableCell>
            <TableCell>{duration(row.avgDurationMs)}</TableCell>
            <TableCell>{count(row.modelCalls)}</TableCell>
            <TableCell>{count(row.toolCalls)}</TableCell>
            <TableCell>{countWithRate(row.outputInvalid, row.executions)}</TableCell>
            <TableCell>{count(row.proposals.created)}</TableCell>
            <TableCell>{countWithRate(row.proposals.approved, row.proposals.created)}</TableCell>
            <TableCell>{countWithRate(row.proposals.partiallyApproved, row.proposals.created)}</TableCell>
            <TableCell>{countWithRate(row.proposals.rejected, row.proposals.created)}</TableCell>
            <TableCell>{count(row.avgTotalTokens)}</TableCell>
            <TableCell>{cost(row.avgEstimatedCost, row.currency)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
