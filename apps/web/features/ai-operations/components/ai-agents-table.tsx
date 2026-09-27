"use client";

import type { AiAgentOperationsView, AiAgentStatus } from "@repo/contracts";
import { Bot, CircleCheck, CircleX, FilePen, type LucideIcon, Archive } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatusVariant } from "@/components/ui/status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import { useAiAgents, useChangeAiAgentStatus } from "../hooks/use-ai-operations";
import { IconStatus } from "./ai-health-table";
import { AiStatusToggle } from "./ai-status-toggle";
import { Missing } from "./format";

const AGENT_STATUS: Record<AiAgentStatus, [string, StatusVariant, LucideIcon]> = {
  ACTIVE: ["Ativo", "success", CircleCheck],
  DISABLED: ["Desabilitado", "danger", CircleX],
  DRAFT: ["Rascunho", "neutral", FilePen],
  DEPRECATED: ["Obsoleto", "neutral", Archive],
};

const RISK: Record<AiAgentOperationsView["riskLevel"], string> = {
  L1_READ_ONLY: "Leitura",
  L2_PROPOSAL: "Proposta",
  L3_ACTION: "Ação",
};

/**
 * "Agentes": registered agents, their route (task, primary and fallback model config, 008/US5-1),
 * their queue and, with `ia.agentes.gerenciar`, the kill switch (006/US7-2).
 */
export function AiAgentsTable({ canManage }: { canManage: boolean }) {
  const agents = useAiAgents();
  const change = useChangeAiAgentStatus();
  const [error, setError] = useState<string | null>(null);

  const toggle = async (agent: AiAgentOperationsView) => {
    setError(null);
    try {
      await change.mutateAsync({ key: agent.key, status: agent.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
    } catch (failure) {
      setError(messageForError(failure));
    }
  };

  return (
    <section aria-labelledby="ia-agentes">
      <h2 id="ia-agentes">Agentes</h2>
      {error || agents.isError ? (
        <Alert variant="danger" className="mb-4">
          <AlertDescription>{error ?? messageForError(agents.error)}</AlertDescription>
        </Alert>
      ) : null}
      {agents.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : agents.data && agents.data.length === 0 ? (
        <EmptyState icon={Bot} headingLevel="h3" title="Nenhum agente registrado." description="Os agentes entram com as próximas funcionalidades." />
      ) : agents.data ? (
        <Table>
          <TableCaption className="sr-only">Agentes de IA</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Agente</TableHead>
              <TableHead scope="col">Versão</TableHead>
              <TableHead scope="col">Nível</TableHead>
              <TableHead scope="col">Tarefa</TableHead>
              <TableHead scope="col">Modelo principal</TableHead>
              <TableHead scope="col">Fallback</TableHead>
              <TableHead scope="col">Na fila / Em execução</TableHead>
              <TableHead scope="col">Situação</TableHead>
              {canManage ? <TableHead scope="col">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.data.map((agent) => (
              <TableRow key={agent.key}>
                <TableCell>
                  {agent.name}
                  <br />
                  <span className="text-body-sm text-text-secondary">{agent.key}</span>
                </TableCell>
                <TableCell>{agent.version}</TableCell>
                <TableCell>
                  <Badge variant={agent.riskLevel === "L1_READ_ONLY" ? "info" : "warning"}>{RISK[agent.riskLevel]}</Badge>
                </TableCell>
                <TableCell>{agent.taskKey ?? <Missing />}</TableCell>
                <TableCell>{agent.primaryModelConfigKey ?? <Missing />}</TableCell>
                <TableCell>{agent.fallbackModelConfigKey ?? "Sem fallback"}</TableCell>
                <TableCell>
                  {agent.queued} / {agent.running}
                </TableCell>
                <TableCell>
                  <IconStatus entry={AGENT_STATUS[agent.status]} />
                </TableCell>
                {canManage ? (
                  <TableCell>
                    {agent.status === "ACTIVE" || agent.status === "DISABLED" ? (
                      <AiStatusToggle
                        disabling={agent.status === "ACTIVE"}
                        subject={`o agente ${agent.name}`}
                        title={agent.status === "ACTIVE" ? `Desabilitar o agente ${agent.name}?` : `Habilitar o agente ${agent.name}?`}
                        consequences={
                          agent.status === "ACTIVE"
                            ? `Pedidos novos serão recusados e as ${agent.queued} execuções na fila serão canceladas.`
                            : "O agente volta a aceitar pedidos novos."
                        }
                        pending={change.isPending && change.variables?.key === agent.key}
                        onConfirm={() => void toggle(agent)}
                      />
                    ) : null}
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
