import type { IntegrityEventType, StudentActivity, StudentExam } from "@repo/contracts";
import type { OccurrenceKind } from "@/components/ui/assessment/warning-dialog";
import { ERROR_MESSAGES } from "@/lib/messages/error-messages";

// 018 contracts/web-ui.md, "Student (`features/exam-attempt`)": the official texts.

export const EXAM_RULES_TITLE = "Regras da prova";

/** The rules shown before the start, with this exam's duration and inactivity limit. */
export function examRules(exam: Pick<StudentExam, "durationMinutes" | "inactivityLimitSeconds">): string[] {
  return [
    `Duração: ${exam.durationMinutes === 1 ? "1 minuto" : `${exam.durationMinutes} minutos`}, contados a partir do seu início, pelo horário do servidor.`,
    `Sair da tela, sair da tela cheia, copiar, colar ou ficar ${exam.inactivityLimitSeconds} s sem interagir conta como ocorrência.`,
    "Você recebe até 3 avisos; na 4ª ocorrência a prova é encerrada e o professor decide se ela é cancelada, com nota zero.",
    "Se precisar sair da sala, chame o professor; o tempo continua correndo.",
    "Não há ajuda da IA.",
  ];
}

export const START_EXAM = "Li as regras e quero iniciar";
export const CONTINUE_EXAM = "Continuar a prova";
export const EXAM_STATUS_LABEL = "Prova";
/** The server's own texts for these refusals (`EXAM_TIME_OVER`, `EXAM_START_CLOSED`). */
export const TIME_OVER = ERROR_MESSAGES.EXAM_TIME_OVER;
export const START_CLOSED = ERROR_MESSAGES.EXAM_START_CLOSED;
export const EXAM_CLOSED = "Esta prova não aceita mais respostas.";

/** Saves and the submit still land up to 2 s after the end (018 research T4). */
export const EXAM_END_GRACE_MS = 2_000;
/** In the last minute each change is saved at once (contracts/web-ui.md). */
export const LAST_MINUTE_MS = 60_000;

/**
 * The exam is running for this student (018 research T7, T18): started, answerable, not handed in,
 * not paused and not on hold. Only then do the timer and the inactivity count.
 */
export const examRunning = (activity: Pick<StudentActivity, "canAnswer" | "submission" | "pause" | "exam">): boolean =>
  activity.canAnswer && activity.submission === null && activity.pause === null && activity.exam?.hold === null && activity.exam.endsAt !== null;

/** 018/US6-1: only the teacher pauses an exam, and its time keeps running (FR-027). */
export const EXAM_PAUSED = "Prova pausada pelo professor. O tempo continua correndo.";

/** The hold's notice, the server's own text (`EXAM_ATTEMPT_ON_HOLD`, 018/FR-018). */
export const ON_HOLD = ERROR_MESSAGES.EXAM_ATTEMPT_ON_HOLD;

/** 018/US5-2: the teacher returned the exam; the time left by the server's clock, rounded up. */
export function returnedNotice(remainingMs: number): string {
  const minutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  return `O professor devolveu a sua prova. Restam ${minutes === 1 ? "1 minuto" : `${minutes} minutos`}.`;
}
export const RESUME_EXAM = "Retomar";
/** 018/FR-029: either decision on a hold reads the same until the result is released. */
export const DECIDED_BEFORE_RELEASE = "Prova encerrada. O resultado aparece quando o professor liberar.";
export const CANCELLED_BY_TEACHER = "Prova cancelada pelo professor.";

/** The occurrence a counted event opens (018 research T6): the warning names it. */
const OCCURRENCE_OF: Partial<Record<IntegrityEventType, OccurrenceKind>> = {
  SCREEN_LEFT: "SCREEN",
  FULLSCREEN_EXITED: "FULLSCREEN",
  PASTE_BLOCKED: "CLIPBOARD",
  COPY_BLOCKED: "CLIPBOARD",
  CUT_BLOCKED: "CLIPBOARD",
  DROP_BLOCKED: "CLIPBOARD",
  INACTIVITY: "INACTIVITY",
};

/** The kind of the latest countable event of a batch, or null when it had none. */
export function occurrenceKindOf(events: readonly { type: IntegrityEventType }[]): OccurrenceKind | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const kind = OCCURRENCE_OF[events[index]!.type];
    if (kind) return kind;
  }
  return null;
}
