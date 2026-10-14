"use client";

import type { ExamMonitor, ExamMonitorStudent, ExamStatusOfStudent } from "@repo/contracts";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplyAttendance } from "@/features/attendance/hooks/use-attendance";
import { messageForError } from "@/lib/messages/error-messages";
import { useExamMonitor, useExamRoomActions } from "../hooks/use-exam-session";
import {
  CONFIRM_PAUSE,
  examStatusLabel,
  HIDE_OCCURRENCES,
  MARK_PRESENT,
  NOT_CANCEL,
  PAUSE_NOTICE,
  PAUSE_STUDENT,
  pauseQuestion,
  RELEASE_RETURN,
  RETURN_EXAM,
  SHOW_OCCURRENCES,
  UNMARK,
} from "../schemas/exam-session";
import { HoldDecisionDialog } from "./hold-decision-dialog";
import { OccurrenceList } from "./occurrence-list";

const STATUS_VARIANTS: Record<ExamStatusOfStudent, "neutral" | "info" | "success" | "warning" | "danger"> = {
  NOT_MARKED: "neutral",
  PRESENT: "info",
  START_CLOSED: "neutral",
  ANSWERING: "info",
  PAUSED: "warning",
  AWAITING_DECISION: "warning",
  SUBMITTED: "success",
  TIME_EXPIRED: "neutral",
  ACTIVITY_CLOSED: "neutral",
  ENDED_BY_WARNINGS: "neutral",
  CANCELLED: "danger",
};

export interface ExamRoomPanelProps {
  classId: string;
  activityId: string;
  /** `provas.encerramentos.decidir`: the three decisions on a hold. */
  canDecide: boolean;
  /** The exam is ACTIVE: presence and pauses can still change (a closed exam keeps only the decisions). */
  active: boolean;
}

/**
 * "Chamada e prova" (018 contracts/web-ui.md, FR-025): each ACTIVE student with the situation in
 * words — the minutes left and the occurrences by the server's clock — and the action it allows,
 * refreshed every 5 s. Students awaiting a decision come first, then the paused ones (the server's
 * order). On a hold: "Ver ocorrências", "Confirmar cancelamento" (confirmed), and "Devolver prova"
 * while the attempt has time (`canReturn`) or "Não cancelar" once it is over. A refused action shows
 * the catalog's message; the monitor is read again either way.
 */
export function ExamRoomPanel({ classId, activityId, canDecide, active }: ExamRoomPanelProps) {
  const query = useExamMonitor(classId, activityId);
  if (query.isPending) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando a prova…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col gap-2">
        <p className="m-0">{messageForError(query.error)}</p>
        <Button type="button" variant="secondary" className="w-fit" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  return <MonitorRows classId={classId} activityId={activityId} monitor={query.data} canDecide={canDecide} active={active} />;
}

function MonitorRows({ classId, activityId, monitor, canDecide, active }: Omit<ExamRoomPanelProps, never> & { monitor: ExamMonitor }) {
  const actions = useExamRoomActions(classId, activityId);
  const attendance = useApplyAttendance(classId, activityId);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const busy = actions.decide.isPending || actions.pause.isPending || actions.release.isPending || attendance.isPending;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(messageForError(caught));
    }
  };
  const decide = (row: ExamMonitorStudent, decision: "cancel" | "return" | "keep") =>
    void run(() => actions.decide.mutateAsync({ holdId: row.openHold!.id, decision }));

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="m-0 text-danger-text">
          {error}
        </p>
      ) : null}
      <ul aria-label="Alunos na prova" className="m-0 flex list-none flex-col gap-3 p-0">
        {monitor.students.map((row) => (
          <li key={row.studentUserId} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span data-student-name>{row.name}</span>
              <Badge variant={STATUS_VARIANTS[row.examStatus]} data-exam-status={row.examStatus}>
                {examStatusLabel(row, monitor)}
              </Badge>
              {row.openHold && row.attemptId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-expanded={opened === row.studentUserId}
                  aria-label={`${opened === row.studentUserId ? HIDE_OCCURRENCES : SHOW_OCCURRENCES} ${row.name}`}
                  onClick={() => setOpened((current) => (current === row.studentUserId ? null : row.studentUserId))}
                >
                  {opened === row.studentUserId ? HIDE_OCCURRENCES : SHOW_OCCURRENCES}
                </Button>
              ) : null}
              {row.openHold && canDecide ? (
                <>
                  <HoldDecisionDialog name={row.name} disabled={busy} onConfirm={() => decide(row, "cancel")} />
                  {row.openHold.canReturn ? (
                    <Button type="button" size="sm" aria-label={`${RETURN_EXAM} ${row.name}`} disabled={busy} onClick={() => decide(row, "return")}>
                      {RETURN_EXAM}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="secondary" aria-label={`${NOT_CANCEL} ${row.name}`} disabled={busy} onClick={() => decide(row, "keep")}>
                      {NOT_CANCEL}
                    </Button>
                  )}
                </>
              ) : null}
              {active && row.openPause ? (
                <Button
                  type="button"
                  size="sm"
                  aria-label={`${RELEASE_RETURN} ${row.name}`}
                  disabled={busy}
                  onClick={() => void run(() => actions.release.mutateAsync(row.openPause!.id))}
                >
                  {RELEASE_RETURN}
                </Button>
              ) : null}
              {active && row.examStatus === "ANSWERING" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" size="sm" variant="secondary" aria-label={`${PAUSE_STUDENT} ${row.name}`} disabled={busy}>
                      {PAUSE_STUDENT}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{pauseQuestion(row.name)}</AlertDialogTitle>
                      <AlertDialogDescription>{PAUSE_NOTICE}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void run(() => actions.pause.mutateAsync(row.studentUserId))}>{CONFIRM_PAUSE}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
              {active && row.examStatus === "NOT_MARKED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-label={`${MARK_PRESENT} ${row.name}`}
                  disabled={busy}
                  onClick={() => void run(() => attendance.mutateAsync({ mark: [row.studentUserId], unmark: [] }))}
                >
                  {MARK_PRESENT}
                </Button>
              ) : null}
              {active && row.examStatus === "PRESENT" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-label={`${UNMARK} ${row.name}`}
                  disabled={busy}
                  onClick={() => void run(() => attendance.mutateAsync({ mark: [], unmark: [row.studentUserId] }))}
                >
                  {UNMARK}
                </Button>
              ) : null}
            </div>
            {opened === row.studentUserId && row.attemptId ? (
              <OccurrenceList classId={classId} activityId={activityId} attemptId={row.attemptId} name={row.name} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
