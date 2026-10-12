"use client";

import type { AttemptPauses, CodeHighlight, IntegrityTimeline, TeacherHelpItem, TeacherPause, TeacherQuestion } from "@repo/contracts";
import { createContext, useContext } from "react";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code/code-block";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAttemptPauses } from "@/features/attendance/hooks/use-attendance";
import {
  ENDED_BY_TIME,
  ENDED_WITH_ACCEPTANCE,
  ENDED_WITH_ACTIVITY,
  NO_ROOM_EXITS,
  OUT_OF_ROOM,
  PAUSE_INITIATOR_LABELS,
  pauseReasonText,
  ROOM_EXITS_TITLE,
} from "@/features/attendance/schemas/attendance";
import { formatLongDateTime, formatTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useAttemptIntegrity } from "../hooks/use-activities";
import {
  EVENT_LABELS,
  EXIT_KINDS,
  formatDuration,
  HELP_STATUS_LABELS,
  HELP_TITLE,
  occurredAt,
  RECORDS_NOTE,
  RECORDS_TITLE,
} from "../schemas/attempt-records";

/**
 * "Registros do modo controlado" (015 US4, FR-025): the attempt's events in time order with the
 * server's time, and each exit's duration from the derived intervals ("sem retorno registrado" when
 * open). Records, never a verdict.
 */
export function IntegrityRecords({ classId, activityId, attemptId }: { classId: string; activityId: string; attemptId: string }) {
  const query = useAttemptIntegrity(classId, activityId, attemptId, true);
  return (
    <section aria-labelledby="registros-titulo" className="flex flex-col gap-2">
      <h3 id="registros-titulo" className="m-0 text-h3">
        {RECORDS_TITLE}
      </h3>
      <p className="m-0">{RECORDS_NOTE}</p>
      {query.error ? (
        <p role="alert" className="m-0">
          {messageForError(query.error)}
        </p>
      ) : !query.data ? (
        <div aria-busy="true">
          <span className="sr-only">Carregando os registros…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <Timeline timeline={query.data} />
      )}
    </section>
  );
}

function Timeline({ timeline }: { timeline: IntegrityTimeline }) {
  const { totals } = timeline;
  if (timeline.events.length === 0) return <p className="m-0">Nenhum registro nesta tentativa.</p>;
  const durationOf = (kind: string, at: string) => timeline.intervals.find((interval) => interval.kind === kind && interval.from === at);
  return (
    <>
      <dl className="m-0 grid gap-1">
        <div>
          <dt className="inline text-text-secondary">Saídas da tela: </dt>
          <dd className="m-0 inline">
            {totals.screenExits} ({formatDuration(totals.timeAwaySeconds)} fora)
          </dd>
        </div>
        <div>
          <dt className="inline text-text-secondary">Quedas de conexão: </dt>
          <dd className="m-0 inline">
            {totals.disconnections} ({formatDuration(totals.offlineSeconds)} sem conexão)
          </dd>
        </div>
        <div>
          <dt className="inline text-text-secondary">Copiar/colar bloqueados: </dt>
          <dd className="m-0 inline">{totals.clipboardBlocks}</dd>
        </div>
      </dl>
      <Table>
        <TableCaption>Eventos da tentativa, no horário do servidor.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Horário</TableHead>
            <TableHead scope="col">Evento</TableHead>
            <TableHead scope="col">Duração</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {timeline.events.map((event, index) => {
            const at = occurredAt(event);
            const kind = EXIT_KINDS[event.type];
            const interval = kind ? durationOf(kind, at) : undefined;
            return (
              <TableRow key={`${at}-${index}`}>
                <TableCell>
                  {formatTime(at)}
                  {event.buffered ? " (enviado depois, sem conexão)" : ""}
                </TableCell>
                <TableCell>
                  {EVENT_LABELS[event.type]}
                  {event.questionPosition !== null ? ` · questão ${event.questionPosition + 1}` : ""}
                </TableCell>
                <TableCell>
                  {interval ? `${formatDuration(interval.seconds)}${interval.open ? " (sem retorno registrado)" : ""}` : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}

/** The attempt's requests of help, by question position, for the questions of the review. */
export const AttemptHelpContext = createContext<readonly TeacherHelpItem[] | null>(null);

/**
 * "Ajuda da IA" in a question (015 US4, FR-025): the student's question, the orientation (text and
 * example as read-only code) and the status with the reason of a blocked one. Text, never HTML.
 */
export function QuestionHelpRecords({ question }: { question: TeacherQuestion }) {
  const items = useContext(AttemptHelpContext)?.filter((item) => item.questionPosition === question.position) ?? [];
  if (items.length === 0) return null;
  const highlight: CodeHighlight | undefined = question.language?.highlight ?? undefined;
  return (
    <section aria-label={`${HELP_TITLE} na questão ${question.position + 1}`} className="flex flex-col gap-2">
      <h4 className="m-0 text-body font-semibold">{HELP_TITLE}</h4>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 border-l-2 border-border pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm text-text-secondary">{formatLongDateTime(item.requestedAt)}</span>
              <Badge variant={item.status === "DELIVERED" ? "info" : "neutral"}>{HELP_STATUS_LABELS[item.status]}</Badge>
            </div>
            <p className="m-0 whitespace-pre-wrap">Pergunta do aluno: {item.question}</p>
            {item.message !== null ? <p className="m-0 whitespace-pre-wrap">Orientação: {item.message}</p> : null}
            {item.example ? <CodeBlock label="Exemplo da orientação" code={item.example.code} highlight={highlight} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * "Saídas da sala" (016 US4, FR-021): each pause of the attempt with its reason and note, who started
 * it, the exit, the return and the duration, all derived by the server. A pause that the close, the
 * cancellation or the acceptance ended says so. Records, never a verdict (SC-008).
 */
export function RoomExitRecords({ classId, activityId, attemptId }: { classId: string; activityId: string; attemptId: string }) {
  const query = useAttemptPauses(classId, activityId, attemptId, true);
  return (
    <section aria-labelledby="saidas-sala-titulo" className="flex flex-col gap-2">
      <h3 id="saidas-sala-titulo" className="m-0 text-h3">
        {ROOM_EXITS_TITLE}
      </h3>
      {query.error ? (
        <p role="alert" className="m-0">
          {messageForError(query.error)}
        </p>
      ) : !query.data ? (
        <div aria-busy="true">
          <span className="sr-only">Carregando as saídas da sala…</span>
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <RoomExits pauses={query.data} />
      )}
    </section>
  );
}

function RoomExits({ pauses }: { pauses: AttemptPauses }) {
  if (pauses.items.length === 0) return <p className="m-0">{NO_ROOM_EXITS}</p>;
  return (
    <>
      <p className="m-0">Tempo total fora: {formatDuration(pauses.totalSecondsAway)}</p>
      <Table>
        <TableCaption>Saídas da sala desta tentativa, no horário do servidor.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Motivo</TableHead>
            <TableHead scope="col">Quem pausou</TableHead>
            <TableHead scope="col">Saída</TableHead>
            <TableHead scope="col">Retorno</TableHead>
            <TableHead scope="col">Duração</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pauses.items.map((pause) => (
            <TableRow key={pause.id}>
              <TableCell>{pauseReasonText(pause)}</TableCell>
              <TableCell>{PAUSE_INITIATOR_LABELS[pause.initiatedBy]}</TableCell>
              <TableCell>
                <time dateTime={pause.startedAt}>{formatTime(pause.startedAt)}</time>
              </TableCell>
              <TableCell>{pauseEnd(pause)}</TableCell>
              <TableCell>{formatDuration(pause.seconds)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function pauseEnd(pause: TeacherPause) {
  if (pause.endedAt === null) return OUT_OF_ROOM;
  if (pause.endedBy === "ACTIVITY_CLOSED") return ENDED_WITH_ACTIVITY;
  if (pause.endedBy === "ACCEPTED") return ENDED_WITH_ACCEPTANCE;
  if (pause.endedBy === "TIME_EXPIRED") return ENDED_BY_TIME;
  return <time dateTime={pause.endedAt}>{formatTime(pause.endedAt)}</time>;
}
