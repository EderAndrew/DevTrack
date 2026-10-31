import { HELP_QUESTION_MAX, type StudentHelpItem } from "@repo/contracts";
import { z } from "zod";

// Texts of the AI help (015 contracts/web-ui.md, "Pedir ajuda").

export const ASK_HELP = "Pedir ajuda";
export const HELP_DIALOG_TITLE = "Pedir ajuda à IA";
export const HELP_NOTE = "A IA orienta, mas não dá a resposta. Não escreva seu nome ou dados pessoais.";
export const HELP_QUESTION_LABEL = "Sua pergunta sobre esta questão";
export const HELP_SEND = "Enviar";
export const HELP_PREPARING = "A IA está preparando uma orientação…";
export const HELP_NOT_USED = "Esta pergunta não usou uma ajuda.";
export const HELP_UNAVAILABLE = "A ajuda está indisponível agora; tente de novo em instantes.";
export const HELP_NONE_USED = "Nenhuma ajuda foi usada.";
export const HELP_EXHAUSTED = "Você já usou as 3 ajudas deste trabalho";
export const HELP_EXAMPLE_LABEL = "Exemplo da orientação";
export const HELP_REPLY_LABEL = "Orientação da IA";

/** The chat's label of a message: which question it is about. */
export const questionLabel = (position: number) => `Questão ${position}`;

/** The end of each reply in the chat: this screen's fixed text, never the model's (015 amendment 2026-10-31). */
export const remainingMessage = (remaining: number) => {
  if (remaining <= 0) return "Não restam mais ajudas.";
  return remaining === 1 ? "Ainda resta 1 ajuda." : `Ainda restam ${remaining} ajudas.`;
};

/** The helps left once each item (oldest first) was answered: only a DELIVERED orientation counts (FR-015). */
export function remainingAfterEach(items: readonly StudentHelpItem[], allowance: number): number[] {
  let delivered = 0;
  return items.map((item) => {
    if (item.status === "DELIVERED") delivered += 1;
    return Math.max(0, allowance - delivered);
  });
}

/** "Ajudas restantes: n de 3" (FR-015). */
export const remainingLabel = (allowance: number, used: number) => `Ajudas restantes: ${Math.max(0, allowance - used)} de ${allowance}`;

/** The dialog's field: 1–500 characters, checked again by the API (FR-016). */
export const HelpFormSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Escreva a sua pergunta.")
    .max(HELP_QUESTION_MAX, `A pergunta pode ter até ${HELP_QUESTION_MAX} caracteres.`),
});
export type HelpFormInput = z.input<typeof HelpFormSchema>;
export type HelpFormOutput = z.output<typeof HelpFormSchema>;

/** The items of one question, oldest first. */
export const itemsOf = (items: readonly StudentHelpItem[], questionId: string) => items.filter((item) => item.questionId === questionId);
