import type { AiModelUsage } from "@repo/contracts";
import { Coins } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cost, count } from "./format";

/** "Uso e custo": calls, tokens and estimated cost per provider and model in the period. */
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
