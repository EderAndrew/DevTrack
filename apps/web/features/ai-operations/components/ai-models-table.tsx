"use client";

import type { AiMetricsPeriod, AiModelCatalogView } from "@repo/contracts";
import { CircleCheck, CircleX, Library } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import { useAiModels } from "../hooks/use-ai-operations";
import { CONFIG_STATUS, IconStatus } from "./ai-health-table";
import { cost } from "./format";
import { LIFECYCLE, MODE, TIER } from "./policy-labels";

const decimals = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

/** Reference price per million tokens, or "Custo desconhecido" when the catalog has none. */
function price(model: AiModelCatalogView): string {
  if (!model.price) return "Custo desconhecido";
  const { inputPerMTok, outputPerMTok, currency } = model.price;
  return `${currency} ${decimals.format(Number(inputPerMTok))} entrada / ${currency} ${decimals.format(Number(outputPerMTok))} saída`;
}

/** "itemRecall 0,96 · schemaValidity 1": the metrics the evaluation measured. */
const metrics = (values: Record<string, number>) =>
  Object.entries(values)
    .map(([name, value]) => `${name} ${decimals.format(value)}`)
    .join(" · ");

/**
 * "Modelos" (009/US6-2, FR-002, FR-021): the catalog — tier, family, mode, lifecycle, status and
 * reference price — and, per task, the quality the evaluation measured next to the real average
 * cost per execution in the period.
 */
export function AiModelsTable({ period }: { period: AiMetricsPeriod }) {
  const models = useAiModels(period);
  const approvals = (models.data ?? []).flatMap((model) => model.approvals.map((approval) => ({ model, approval })));
  return (
    <section aria-labelledby="ia-modelos">
      <h2 id="ia-modelos">Modelos</h2>
      {models.isError ? (
        <Alert variant="danger" className="mb-4">
          <AlertDescription>{messageForError(models.error)}</AlertDescription>
        </Alert>
      ) : null}
      {models.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : models.data && models.data.length === 0 ? (
        <EmptyState icon={Library} headingLevel="h3" title="Nenhum modelo no catálogo." />
      ) : models.data ? (
        <div className="flex flex-col gap-4">
          <Table>
            <TableCaption className="sr-only">Catálogo de modelos</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Entrada</TableHead>
                <TableHead scope="col">Modelo</TableHead>
                <TableHead scope="col">Família</TableHead>
                <TableHead scope="col">Nível</TableHead>
                <TableHead scope="col">Modo</TableHead>
                <TableHead scope="col">Ciclo de vida</TableHead>
                <TableHead scope="col">Situação</TableHead>
                <TableHead scope="col">Preço por milhão de tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.data.map((model) => (
                <TableRow key={model.key}>
                  <TableCell>{model.key}</TableCell>
                  <TableCell>{model.model}</TableCell>
                  <TableCell>{model.family}</TableCell>
                  <TableCell>{TIER[model.tier]}</TableCell>
                  <TableCell>{MODE[model.mode]}</TableCell>
                  <TableCell>
                    <IconStatus entry={LIFECYCLE[model.lifecycle]} />
                  </TableCell>
                  <TableCell>
                    <IconStatus entry={CONFIG_STATUS[model.status]} />
                  </TableCell>
                  <TableCell>{price(model)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {approvals.length > 0 ? (
            <Table>
              <TableCaption className="sr-only">Qualidade e custo por tarefa</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Tarefa</TableHead>
                  <TableHead scope="col">Modelo</TableHead>
                  <TableHead scope="col">Aprovação</TableHead>
                  <TableHead scope="col">Qualidade medida</TableHead>
                  <TableHead scope="col">Custo médio por execução</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals
                  .sort((a, b) => a.approval.taskKey.localeCompare(b.approval.taskKey) || a.model.key.localeCompare(b.model.key))
                  .map(({ model, approval }) => (
                    <TableRow key={`${approval.taskKey}:${model.key}`}>
                      <TableCell>{approval.taskKey}</TableCell>
                      <TableCell>{model.key}</TableCell>
                      <TableCell>
                        <IconStatus entry={approval.valid ? ["Aprovado", "success", CircleCheck] : ["Abaixo dos limiares", "danger", CircleX]} />
                      </TableCell>
                      <TableCell>{metrics(approval.metrics)}</TableCell>
                      <TableCell>{cost(approval.avgCostPerExecution, model.price?.currency ?? null)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
