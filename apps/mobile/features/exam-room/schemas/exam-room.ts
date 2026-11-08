import { EXAM_WARNINGS, type ExamMonitorStudent, type ExamStatusOfStudent, type IntegrityEventView } from "@repo/contracts";

// 024 research Y10: the room's words are the web's (apps/web/features/exam-session/schemas/exam-session.ts),
// copied verbatim so the phone says exactly what the computer says; test/wording-parity.test.ts compares the
// two files. The action texts come along with the copy, but the app shows none of them (024/FR-010). No text
// names fraud (FR-022).

const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const clockWithSeconds = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** The time of a server instant in the phone's time zone, "14:32" (the web's `formatTime`). */
export const formatTime = (iso: string) => clock.format(new Date(iso));

// ── Copied from the web (exam-session.ts) ────────────────────────────────────────────────────

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

export const cancelQuestion = (name: string) => `Cancelar a prova de ${name}?`;
export const CANCEL_NOTICE = "A nota será zero. Esta decisão é registrada.";

export const pauseQuestion = (name: string) => `Pausar a prova de ${name}?`;
export const PAUSE_NOTICE = "A prova sai da tela do aluno até você liberar o retorno. O tempo continua correndo.";
export const CONFIRM_PAUSE = "Pausar";

/** Whole minutes left, rounded up, by the server's clock (018 research T4); never negative. */
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

/** A student's situation in words, with the times of the server (024/FR-007, FR-011). */
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

export const pendingDecisionsLabel = (count: number) => (count === 1 ? "1 decisão pendente" : `${count} decisões pendentes`);

export const NO_OCCURRENCES = "Nenhuma ocorrência registrada.";

/** One counted occurrence in words (024/FR-009). */
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

// ── The app's own words (contracts/mobile-ui.md) ─────────────────────────────────────────────

export const DECIDE_ON_COMPUTER = "Decida no computador";
export const EXAM_CLOSED = "Esta prova foi encerrada.";
export const OFFLINE = "Sem conexão — os dados podem estar desatualizados";
export const ALERTS_MUTED = "Avisos silenciados";
export const STUDENTS_LABEL = "Alunos na prova";

/** "Atualizado às 14:32:05": the last successful read, in the phone's time zone. */
export const updatedAtLabel = (at: number) => `Atualizado às ${clockWithSeconds.format(new Date(at))}`;

/** What an occurrence led to: a warning (1 to 3), the hold, or a new one after a return (024/US2-4). */
export function warningLabel(ordinal: number, holdOrdinals: ReadonlySet<number>): string {
  if (holdOrdinals.has(ordinal)) return "Prova retida";
  if (ordinal <= EXAM_WARNINGS) return `Aviso ${ordinal} de ${EXAM_WARNINGS}`;
  return "Nova ocorrência";
}

// ── 025: the teacher's discreet warning (specs/025-exam-student-nudge/contracts/ui.md) ───────

/** The bell's accessible name, in the room's row and in the student's detail. */
export const nudgeLabel = (name: string) => `Enviar aviso para ${name}`;
export const nudgeQuestion = (name: string) => `Enviar aviso para ${name}?`;
export const nudgeNotice = (name: string) => `Só ${name} verá o aviso na tela da prova.`;
export const SEND_NUDGE = "Enviar aviso";
export const CANCEL = "Cancelar";
export const NUDGE_PENDING = "Aviso enviado — aguardando o aluno";
/** The time of the server's last dismissal, in the phone's time zone. */
export const lastNudgeDismissedLabel = (iso: string) => `Último aviso fechado às ${formatTime(iso)}`;
export const NUDGE_NOT_ALLOWED = "Não é possível enviar o aviso agora.";

/** The badge tone of each situation; the text always says it (FR-022: never colour alone). */
export const STATUS_TONES: Record<ExamStatusOfStudent, "neutral" | "info" | "success" | "warning" | "danger"> = {
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
