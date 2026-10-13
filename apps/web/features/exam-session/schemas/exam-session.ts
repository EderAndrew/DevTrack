import type { ExamMonitorStudent, ExamStatusOfStudent, IntegrityEventView } from "@repo/contracts";
import { formatTime } from "@/lib/messages/dates";

// 018 contracts/web-ui.md, "Prova em andamento (`features/exam-session`)": the official texts. A
// situation is always written out, never shown by colour alone; no text names fraud (FR-032).

export const EXAM_ROOM_TITLE = "Chamada e prova";

export const MARK_PRESENT = "Marcar presente";
export const UNMARK = "Desmarcar";
export const PAUSE_STUDENT = "Pausar aluno";
export const RELEASE_RETURN = "Liberar retorno";
export const SHOW_OCCURRENCES = "Ver ocorrências";
export const HIDE_OCCURRENCES = "Ocultar ocorrências";
export const CONFIRM_CANCELLATION = "Confirmar cancelamento";
export const RETURN_EXAM = "Devolver prova";
export const NOT_CANCEL = "Não cancelar";

/** The confirmation of "Confirmar cancelamento" (FR-021): the zero is said before the click. */
export const cancelQuestion = (name: string) => `Cancelar a prova de ${name}?`;
export const CANCEL_NOTICE = "A nota será zero. Esta decisão é registrada.";

/** "Pausar aluno" in an exam: the time keeps running (018/FR-027). */
export const pauseQuestion = (name: string) => `Pausar a prova de ${name}?`;
export const PAUSE_NOTICE = "A prova sai da tela do aluno até você liberar o retorno. O tempo continua correndo.";
export const CONFIRM_PAUSE = "Pausar";

/** Whole minutes left, rounded up, by the server's clock (research T4); never negative. */
export function minutesLeft(endsAt: string | null, serverNow: string): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - Date.parse(serverNow)) / 60_000));
}

const minutes = (n: number) => (n === 1 ? "1 min restante" : `${n} min restantes`);
const occurrences = (n: number) => (n === 1 ? "1 ocorrência" : `${n} ocorrências`);

const FIXED: Partial<Record<ExamStatusOfStudent, string>> = {
  NOT_MARKED: "Não marcado",
  START_CLOSED: "Não iniciou (prazo para iniciar encerrado)",
  AWAITING_DECISION: "Encerrada por avisos — aguardando decisão",
  SUBMITTED: "Entregou",
  TIME_EXPIRED: "Tempo esgotado",
  ACTIVITY_CLOSED: "Encerrada com a atividade",
  ENDED_BY_WARNINGS: "Encerrada por avisos — não cancelada",
  CANCELLED: "Cancelada — nota zero",
};

/** A student's situation in words (the table of contracts/web-ui.md), with the times of the server. */
export function examStatusLabel(row: ExamMonitorStudent, monitor: { startDeadline: string; serverNow: string }): string {
  switch (row.examStatus) {
    case "PRESENT":
      return `Presente — pode iniciar até ${formatTime(monitor.startDeadline)}`;
    case "ANSWERING":
      return `Respondendo — ${minutes(minutesLeft(row.endsAt, monitor.serverNow))} — ${occurrences(row.occurrenceCount)}`;
    case "PAUSED":
      return `Pausado — desde ${formatTime(row.openPause!.startedAt)} — ${minutes(minutesLeft(row.endsAt, monitor.serverNow))}`;
    default:
      return FIXED[row.examStatus]!;
  }
}

/** "Liberar resultado" waits for the decisions (FR-024): "1 decisão pendente", "2 decisões pendentes". */
export const pendingDecisionsLabel = (count: number) => (count === 1 ? "1 decisão pendente" : `${count} decisões pendentes`);

export const NO_OCCURRENCES = "Nenhuma ocorrência registrada.";

/** One counted occurrence in words (contracts/web-ui.md "Ver ocorrências"). */
export function occurrenceLabel(event: Pick<IntegrityEventView, "type" | "idleSeconds">): string {
  switch (event.type) {
    case "SCREEN_LEFT":
      return "Saiu da tela";
    case "FULLSCREEN_EXITED":
      return "Saiu da tela cheia";
    case "INACTIVITY":
      return `Sem interação por ${event.idleSeconds ?? 0} s`;
    default:
      return "Tentou copiar/colar";
  }
}
