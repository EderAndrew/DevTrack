"use client";

import type { AiModelConfigStatus, AiProviderStatus } from "@repo/contracts";
import { CircleCheck, CircleX, type LucideIcon, ServerCog, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Status, type StatusVariant } from "@/components/ui/status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import { useAiHealth } from "../hooks/use-ai-operations";

const PROVIDER: Record<AiProviderStatus, [string, StatusVariant, LucideIcon]> = {
  UP: ["Respondendo", "success", CircleCheck],
  DOWN: ["Sem resposta", "danger", CircleX],
  NOT_CONFIGURED: ["Não configurado", "warning", TriangleAlert],
};

export const CONFIG_STATUS: Record<AiModelConfigStatus, [string, StatusVariant, LucideIcon]> = {
  ENABLED: ["Habilitada", "success", CircleCheck],
  DISABLED: ["Desabilitada", "neutral", CircleX],
};

/** A status in words and with an icon, never by color alone. */
export function IconStatus({ entry }: { entry: [string, StatusVariant, LucideIcon] }) {
  const [label, variant, Icon] = entry;
  return (
    <Status variant={variant}>
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Status>
  );
}

/** "Saúde": each model config and whether its provider answers (006/US7-5). */
export function AiHealthTable() {
  const health = useAiHealth();
  return (
    <section aria-labelledby="ia-saude">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="ia-saude" className="m-0">
          Saúde
        </h2>
        <Button type="button" variant="secondary" aria-busy={health.isFetching || undefined} onClick={() => void health.refetch()}>
          Verificar de novo
        </Button>
      </div>
      {health.isError ? (
        <Alert variant="danger" className="mb-4">
          <AlertDescription>{messageForError(health.error)}</AlertDescription>
        </Alert>
      ) : null}
      {health.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : health.data && health.data.modelConfigs.length === 0 ? (
        <EmptyState icon={ServerCog} headingLevel="h3" title="Nenhuma configuração de modelo registrada." />
      ) : health.data ? (
        <Table>
          <TableCaption className="sr-only">Saúde das configurações de modelo</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Configuração</TableHead>
              <TableHead scope="col">Provedor</TableHead>
              <TableHead scope="col">Modelo</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Provedor responde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {health.data.modelConfigs.map((config) => (
              <TableRow key={config.key}>
                <TableCell>{config.key}</TableCell>
                <TableCell>{config.provider}</TableCell>
                <TableCell>{config.model}</TableCell>
                <TableCell>
                  <IconStatus entry={CONFIG_STATUS[config.status]} />
                </TableCell>
                <TableCell>
                  <IconStatus entry={PROVIDER[config.providerStatus]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </section>
  );
}
