import type { AiFamilyMetrics, AiTaskMetrics, AiTierMetrics } from "@repo/contracts";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cost, count, countWithRate, duration, Missing } from "./format";
import { tierLabel } from "./policy-labels";

/**
 * Cost in the period by task, tier and family (009/US6-1, US6-3): calls, tokens, average latency
 * and estimated cost, with the fallbacks and escalations of each task apart. Empty groups render
 * nothing; the section's usage table already says when there were no calls.
 */
export function AiCostBreakdown({ byTask, byTier, byFamily }: { byTask: AiTaskMetrics[]; byTier: AiTierMetrics[]; byFamily: AiFamilyMetrics[] }) {
  return (
    <>
      {byTask.length > 0 ? (
        <Table>
          <TableCaption className="sr-only">Custo por tarefa</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Tarefa</TableHead>
              <TableHead scope="col">Agentes</TableHead>
              <TableHead scope="col">Execuções</TableHead>
              <TableHead scope="col">Chamadas</TableHead>
              <TableHead scope="col">Fallbacks</TableHead>
              <TableHead scope="col">Escalonamentos</TableHead>
              <TableHead scope="col">Duração média</TableHead>
              <TableHead scope="col">Tokens de entrada</TableHead>
              <TableHead scope="col">Tokens de saída</TableHead>
              <TableHead scope="col">Custo estimado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byTask.map((row) => (
              <TableRow key={row.taskKey}>
                <TableCell>{row.taskKey}</TableCell>
                <TableCell>{row.agentKeys.length > 0 ? row.agentKeys.join(", ") : <Missing />}</TableCell>
                <TableCell>{count(row.executions)}</TableCell>
                <TableCell>{count(row.calls)}</TableCell>
                <TableCell>{countWithRate(row.fallbacks, row.executions)}</TableCell>
                <TableCell>{countWithRate(row.escalations, row.executions)}</TableCell>
                <TableCell>{duration(row.avgDurationMs)}</TableCell>
                <TableCell>{count(row.inputTokens)}</TableCell>
                <TableCell>{count(row.outputTokens)}</TableCell>
                <TableCell>{cost(row.estimatedCost, row.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {byTier.length > 0 ? (
        <Table>
          <TableCaption className="sr-only">Custo por nível</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nível</TableHead>
              <TableHead scope="col">Chamadas</TableHead>
              <TableHead scope="col">Duração média</TableHead>
              <TableHead scope="col">Tokens de entrada</TableHead>
              <TableHead scope="col">Tokens de saída</TableHead>
              <TableHead scope="col">Custo estimado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byTier.map((row) => (
              <TableRow key={row.tier ?? "none"}>
                <TableCell>{tierLabel(row.tier)}</TableCell>
                <TableCell>{count(row.calls)}</TableCell>
                <TableCell>{duration(row.avgDurationMs)}</TableCell>
                <TableCell>{count(row.inputTokens)}</TableCell>
                <TableCell>{count(row.outputTokens)}</TableCell>
                <TableCell>{cost(row.estimatedCost, row.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {byFamily.length > 0 ? (
        <Table>
          <TableCaption className="sr-only">Custo por família</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Família</TableHead>
              <TableHead scope="col">Chamadas</TableHead>
              <TableHead scope="col">Fallbacks</TableHead>
              <TableHead scope="col">Duração média</TableHead>
              <TableHead scope="col">Tokens de entrada</TableHead>
              <TableHead scope="col">Tokens de saída</TableHead>
              <TableHead scope="col">Custo estimado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byFamily.map((row) => (
              <TableRow key={row.family ?? "none"}>
                <TableCell>{row.family ?? <Missing />}</TableCell>
                <TableCell>{count(row.calls)}</TableCell>
                <TableCell>{countWithRate(row.fallbackCalls, row.calls)}</TableCell>
                <TableCell>{duration(row.avgDurationMs)}</TableCell>
                <TableCell>{count(row.inputTokens)}</TableCell>
                <TableCell>{count(row.outputTokens)}</TableCell>
                <TableCell>{cost(row.estimatedCost, row.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </>
  );
}
