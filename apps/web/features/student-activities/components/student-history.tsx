"use client";

import { History, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLongDateTime } from "@/lib/messages/dates";
import type { StudentActivityListFilters } from "../api/student-activities";
import { useStudentActivities } from "../hooks/use-student-activities";
import { ACTIVITY_TYPE_LABELS, activityHref, formatGrade, STATUS_VARIANTS, statusLabel } from "../schemas/student-activity";
import { LoadFailed, Loading } from "./load-states";

const COMPLETED: StudentActivityListFilters = { status: "COMPLETED", type: null };

export const HISTORY_EMPTY = "Você ainda não entregou nenhuma atividade.";

/**
 * "Histórico" (012 US6, FR-031): the submitted activities (`status=COMPLETED`) with atividade, tipo,
 * turma/disciplina, entregue em ("com atraso"), situação, and the grade and "Com feedback" once the
 * result is released; each opens the activity with the student's read-only answers.
 */
export function StudentHistory() {
  const query = useStudentActivities(COMPLETED);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isPending) return <Loading label="Carregando seu histórico…" />;
  if (query.isError && items.length === 0) return <LoadFailed error={query.error} onRetry={() => void query.refetch()} />;
  if (items.length === 0) return <EmptyState icon={History} title={HISTORY_EMPTY} />;

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableCaption>Atividades que você entregou.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Atividade</TableHead>
            <TableHead scope="col">Tipo</TableHead>
            <TableHead scope="col">Turma</TableHead>
            <TableHead scope="col">Entregue em</TableHead>
            <TableHead scope="col">Situação</TableHead>
            <TableHead scope="col">Nota</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Link href={activityHref(item.id)}>{item.title}</Link>
              </TableCell>
              <TableCell>{ACTIVITY_TYPE_LABELS[item.type]}</TableCell>
              <TableCell>{item.subjectName ? `${item.class.name} · ${item.subjectName}` : item.class.name}</TableCell>
              <TableCell>
                {item.submittedAt ? formatLongDateTime(item.submittedAt) : "—"}
                {item.late ? " (com atraso)" : ""}
              </TableCell>
              <TableCell>
                <Status variant={STATUS_VARIANTS[item.status]}>{statusLabel(item)}</Status>
              </TableCell>
              <TableCell>
                {item.result ? (
                  <div className="flex flex-col items-start gap-1">
                    <span>
                      {formatGrade(item.result.grade)} de {formatGrade(item.totalGrade)}
                    </span>
                    {item.result.hasFeedback ? (
                      <Badge variant="info">
                        <MessageSquareText aria-hidden="true" />
                        Com feedback
                      </Badge>
                    ) : null}
                  </div>
                ) : (
                  "Aguardando correção"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {query.isFetchNextPageError ? <LoadFailed error={query.error} onRetry={() => void query.fetchNextPage()} /> : null}
      {query.hasNextPage ? (
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          aria-disabled={query.isFetchingNextPage || undefined}
          onClick={() => {
            if (!query.isFetchingNextPage) void query.fetchNextPage();
          }}
        >
          {query.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
        </Button>
      ) : null}
    </div>
  );
}
