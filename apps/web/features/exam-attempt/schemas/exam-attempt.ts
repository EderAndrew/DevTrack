import type { StudentExam } from "@repo/contracts";
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
