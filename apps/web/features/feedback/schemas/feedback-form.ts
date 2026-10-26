import { FEEDBACK_DAILY_LIMIT, FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_MIN, type FeedbackCategory, FeedbackCategorySchema } from "@repo/contracts";
import { z } from "zod";

// Texts of "Enviar feedback" (020 contracts/web-ui.md, "Student — dialog FeedbackDialog").

export const SEND_FEEDBACK = "Enviar feedback";
export const FEEDBACK_DESCRIPTION =
  "Conte o que não funcionou, o que falta ou o que ajudou. Quem administra o DevTrack vai ler. Seu professor não vê.";
export const CATEGORY_LEGEND = "Categoria";
export const MESSAGE_LABEL = "Mensagem";
export const ORIGIN_NOTE = "Vamos registrar a tela em que você está para entender o contexto.";
export const SEND = "Enviar";
export const SENDING = "Enviando…";
export const FEEDBACK_SENT = "Feedback enviado. Obrigado!";
export const SEND_FAILED = "Não foi possível enviar agora. Tente de novo.";

// "Meus feedbacks" (020 contracts/web-ui.md, "Student — page").
export const MY_FEEDBACKS_TITLE = "Meus feedbacks";
export const NO_OWN_FEEDBACKS = "Você ainda não enviou feedbacks.";

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  PROBLEM: "Problema",
  SUGGESTION: "Sugestão",
  PRAISE: "Elogio",
  OTHER: "Outro",
};
export const CATEGORY_HINTS: Partial<Record<FeedbackCategory, string>> = {
  PROBLEM: "Algo não funciona como deveria",
  SUGGESTION: "Uma ideia para melhorar",
  PRAISE: "Algo que ajudou você",
};

const MAX_LABEL = FEEDBACK_MESSAGE_MAX.toLocaleString("pt-BR");

/** Characters as the student sees them: an emoji or an accented letter counts as one (research J9). */
export const codePoints = (value: string) => [...value].length;

/** "N de 2.000". */
export const counterLabel = (value: string) => `${codePoints(value)} de ${MAX_LABEL}`;

/** The form's fields; the API checks them again with the contract schema. */
export const FeedbackFormSchema = z.object({
  category: FeedbackCategorySchema.nullable().refine((value) => value !== null, "Escolha uma categoria."),
  message: z
    .string()
    .trim()
    .refine((value) => codePoints(value) >= FEEDBACK_MESSAGE_MIN, `Escreva pelo menos ${FEEDBACK_MESSAGE_MIN} caracteres.`)
    .refine((value) => codePoints(value) <= FEEDBACK_MESSAGE_MAX, `Use no máximo ${MAX_LABEL} caracteres.`),
});
export type FeedbackFormInput = z.input<typeof FeedbackFormSchema>;
export type FeedbackFormOutput = z.output<typeof FeedbackFormSchema>;

/** "1 hora", "19 horas", "1 minuto", "45 minutos": the wait of `Retry-After`, rounded up. */
export function waitLabel(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600);
    return `${hours} hora${hours > 1 ? "s" : ""}`;
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minuto${minutes > 1 ? "s" : ""}`;
}

/** The `429` of the limit (research J4): the text stays in the field. */
export const limitReached = (retryAfterSeconds: number) =>
  `Você já enviou ${FEEDBACK_DAILY_LIMIT} feedbacks nas últimas 24 horas. Tente de novo em ${waitLabel(retryAfterSeconds)}.`;
