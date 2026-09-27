import type { AiModelUsage } from "@repo/contracts";
import { Coins } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cost, count, countWithRate, duration } from "./format";

/**
 * "Uso e custo": calls, tokens and estimated cost per provider and model in the period; the model
 * is the one served when the provider said so, with the failed and fallback calls and the average
 * duration (008/US5-1).
 */
export function AiUsageTable({ rows }: { rows: AiModelUsage[] }) {
  if (rows.length === 0) return <EmptyState icon={Coins} headingLevel="h3" title="Nenhuma chamada ao modelo no período." />;
  return (
    <Table>
      <TableCaption className="sr-only">Uso e custo por modelo</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Provedor</TableHead>
          <TableHead scope="col">Modelo</TableHead>
          <TableHead scope="col">Chamadas</TableHead>
          <TableHead scope="col">Falhas</TableHead>
          <TableHead scope="col">Fallbacks</TableHead>
          <TableHead scope="col">Duração média</TableHead>
          <TableHead scope="col">Tokens de entrada</TableHead>
          <TableHead scope="col">Tokens de saída</TableHead>
          <TableHead scope="col">Total</TableHead>
          <TableHead scope="col">Custo estimado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.provider}:${row.model}`}>
            <TableCell>{row.provider}</TableCell>
            <TableCell>{row.model}</TableCell>
            <TableCell>{count(row.calls)}</TableCell>
            <TableCell>{countWithRate(row.failedCalls, row.calls)}</TableCell>
            <TableCell>{countWithRate(row.fallbackCalls, row.calls)}</TableCell>
            <TableCell>{duration(row.avgDurationMs)}</TableCell>
            <TableCell>{count(row.inputTokens)}</TableCell>
            <TableCell>{count(row.outputTokens)}</TableCell>
            <TableCell>{count(row.totalTokens)}</TableCell>
            <TableCell>{cost(row.estimatedCost, row.currency)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
