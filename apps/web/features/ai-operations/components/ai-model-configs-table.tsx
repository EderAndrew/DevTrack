"use client";

import type { AiModelConfigView } from "@repo/contracts";
import { ServerCog } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import { useAiModelConfigs, useChangeAiModelConfigStatus } from "../hooks/use-ai-operations";
import { CONFIG_STATUS, IconStatus } from "./ai-health-table";
import { AiStatusToggle } from "./ai-status-toggle";
import { duration } from "./format";

/** "Configurações de modelo": provider, model, limits and, with `ia.agentes.gerenciar`, the kill switch (006/US7-3). */
export function AiModelConfigsTable({ canManage }: { canManage: boolean }) {
  const configs = useAiModelConfigs();
  const change = useChangeAiModelConfigStatus();
  const [error, setError] = useState<string | null>(null);

  const toggle = async (config: AiModelConfigView) => {
    setError(null);
    try {
      await change.mutateAsync({ key: config.key, status: config.status === "ENABLED" ? "DISABLED" : "ENABLED" });
    } catch (failure) {
      setError(messageForError(failure));
    }
  };

  return (
    <section aria-labelledby="ia-configuracoes">
      <h2 id="ia-configuracoes">Configurações de modelo</h2>
      {error || configs.isError ? (
        <Alert variant="danger" className="mb-4">
          <AlertDescription>{error ?? messageForError(configs.error)}</AlertDescription>
        </Alert>
      ) : null}
      {configs.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : configs.data && configs.data.length === 0 ? (
        <EmptyState icon={ServerCog} headingLevel="h3" title="Nenhuma configuração de modelo registrada." />
      ) : configs.data ? (
        <Table>
          <TableCaption className="sr-only">Configurações de modelo</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Configuração</TableHead>
              <TableHead scope="col">Provedor</TableHead>
              <TableHead scope="col">Modelo</TableHead>
              <TableHead scope="col">Tempo limite</TableHead>
              <TableHead scope="col">Preço</TableHead>
              <TableHead scope="col">Agentes</TableHead>
              <TableHead scope="col">Situação</TableHead>
              {canManage ? <TableHead scope="col">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.data.map((config) => (
              <TableRow key={config.key}>
                <TableCell>{config.key}</TableCell>
                <TableCell>{config.provider}</TableCell>
                <TableCell>{config.model}</TableCell>
                <TableCell>{duration(config.timeoutMs)}</TableCell>
                <TableCell>{config.hasPrice ? "Informado" : "Não informado"}</TableCell>
                <TableCell>{config.agentKeys.length > 0 ? config.agentKeys.join(", ") : "Nenhum"}</TableCell>
                <TableCell>
                  <IconStatus entry={CONFIG_STATUS[config.status]} />
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <AiStatusToggle
                      disabling={config.status === "ENABLED"}
                      subject={`a configuração ${config.key}`}
                      title={config.status === "ENABLED" ? `Desabilitar a configuração ${config.key}?` : `Habilitar a configuração ${config.key}?`}
                      consequences={
                        config.status === "ENABLED"
                          ? config.agentKeys.length > 0
                            ? `Os agentes ${config.agentKeys.join(", ")} deixarão de aceitar pedidos novos.`
                            : "Nenhum agente usa esta configuração agora."
                          : "Os agentes desta configuração voltam a aceitar pedidos novos."
                      }
                      pending={change.isPending && change.variables?.key === config.key}
                      onConfirm={() => void toggle(config)}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </section>
  );
}
