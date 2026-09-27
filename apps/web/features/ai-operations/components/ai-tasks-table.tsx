"use client";

import type { AiTaskPolicyView } from "@repo/contracts";
import { ListChecks } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import { useAiTasks } from "../hooks/use-ai-operations";
import { IconStatus } from "./ai-health-table";
import { Missing } from "./format";
import { MODE, SELECTION_REASON, TIER, UNAVAILABLE_ICON, UNAVAILABLE_REASON } from "./policy-labels";

/** "Básico" or "Básico (até Padrão)" when the task may escalate. */
const tiers = (task: AiTaskPolicyView) => (task.maxTier === task.preferredTier ? TIER[task.preferredTier] : `${TIER[task.preferredTier]} (até ${TIER[task.maxTier]})`);

function Selection({ task }: { task: AiTaskPolicyView }) {
  if ("unavailable" in task.selection) {
    return (
      <Status variant="danger">
        <UNAVAILABLE_ICON aria-hidden="true" className="size-4" />
        Indisponível: {UNAVAILABLE_REASON[task.selection.unavailable]}
      </Status>
    );
  }
  const { primaryKey, fallbackKey } = task.selection;
  return <>{fallbackKey ? `${primaryKey} (fallback: ${fallbackKey})` : primaryKey}</>;
}

/**
 * "Tarefas" (009/US6, FR-006, FR-010): each task's policy — tier, families, fallback and
 * escalation — and the model the policy chooses now with the reason, in words and with an icon; a
 * task left with only a deprecated model reads as a warning (US5-4).
 */
export function AiTasksTable() {
  const tasks = useAiTasks();
  return (
    <section aria-labelledby="ia-tarefas">
      <h2 id="ia-tarefas">Tarefas</h2>
      {tasks.isError ? (
        <Alert variant="danger" className="mb-4">
          <AlertDescription>{messageForError(tasks.error)}</AlertDescription>
        </Alert>
      ) : null}
      {tasks.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : tasks.data && tasks.data.length === 0 ? (
        <EmptyState icon={ListChecks} headingLevel="h3" title="Nenhuma tarefa registrada." />
      ) : tasks.data ? (
        <Table>
          <TableCaption className="sr-only">Tarefas e modelo escolhido</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Tarefa</TableHead>
              <TableHead scope="col">Agentes</TableHead>
              <TableHead scope="col">Modo</TableHead>
              <TableHead scope="col">Nível</TableHead>
              <TableHead scope="col">Famílias</TableHead>
              <TableHead scope="col">Fallback</TableHead>
              <TableHead scope="col">Escalonamento</TableHead>
              <TableHead scope="col">Modelo escolhido</TableHead>
              <TableHead scope="col">Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.data.map((task) => (
              <TableRow key={task.key}>
                <TableCell>{task.key}</TableCell>
                <TableCell>{task.agentKeys.length > 0 ? task.agentKeys.join(", ") : "Nenhum"}</TableCell>
                <TableCell>{MODE[task.mode]}</TableCell>
                <TableCell>{tiers(task)}</TableCell>
                <TableCell>{task.allowedFamilies.join(", ")}</TableCell>
                <TableCell>{task.fallback === "SAME_TIER" ? "Mesmo nível" : "Sem fallback"}</TableCell>
                <TableCell>{task.escalation === "ON_OUTPUT_INVALID" ? "Ao nível seguinte, se a saída for inválida" : "Não escala"}</TableCell>
                <TableCell>
                  <Selection task={task} />
                </TableCell>
                <TableCell>{"reason" in task.selection ? <IconStatus entry={SELECTION_REASON[task.selection.reason]} /> : <Missing />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </section>
  );
}
