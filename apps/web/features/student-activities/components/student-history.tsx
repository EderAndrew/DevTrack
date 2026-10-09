"use client";

import { History, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { occurredAt } from "@/features/activities/schemas/attempt-records";
import { formatLongDateTime, formatTime } from "@/lib/messages/dates";
import type { StudentActivityListFilters } from "../api/student-activities";
import { useOwnIntegrity, useStudentActivities } from "../hooks/use-student-activities";
import { ACTIVITY_TYPE_LABELS, activityHref, formatGrade, STATUS_VARIANTS, statusLabel } from "../schemas/student-activity";
import { LoadFailed, Loading } from "./load-states";

const COMPLETED: StudentActivityListFilters = { status: "COMPLETED", type: null };

export const HISTORY_EMPTY = "Você ainda não entregou nenhuma atividade.";
/** 015/US5-2: what the teacher sees of the student's screen exits, told to the student too. */
export const SCREEN_EXITS_NOTE = "O professor vê estes registros. Uma saída não significa, sozinha, uso indevido.";
export const screenExitsLabel = (count: number) => `Saídas da tela registradas: ${count}`;

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
                      {formatGrade(item.result.grade)} de {formatGrade(item.totalGrade ?? "0.00")}
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

/**
 * The screen exits of a delivered CONTROLLED work (015/US5-2, FR-027): "Saídas da tela registradas:
 * n" and the time of each exit, as the server recorded it (the browser's time only for an event
 * kept offline). The orientations of the AI stay under their questions. Facts, never a verdict.
 */
export function ScreenExitRecords({ activityId }: { activityId: string }) {
  const query = useOwnIntegrity(activityId, true);
  if (query.isPending) return <Loading label="Carregando os registros da entrega…" />;
  if (query.isError) return <LoadFailed error={query.error} onRetry={() => void query.refetch()} />;
  const exits = query.data.events.filter((event) => event.type === "SCREEN_LEFT");
  return (
    <section aria-labelledby="saidas-registradas" className="flex flex-col gap-2">
      <h2 id="saidas-registradas" className="m-0 text-h3">
        {screenExitsLabel(query.data.totals.screenExits)}
      </h2>
      <p className="m-0 text-body-sm text-text-secondary">{SCREEN_EXITS_NOTE}</p>
      {exits.length > 0 ? (
        <ul aria-label="Horários das saídas" className="m-0 flex flex-col gap-1 pl-5">
          {exits.map((event, index) => {
            const at = occurredAt(event);
            return (
              <li key={`${index}-${event.recordedAt}`}>
                <time dateTime={at}>{formatTime(at)}</time>
                {at !== event.recordedAt ? " (horário do navegador)" : ""}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
