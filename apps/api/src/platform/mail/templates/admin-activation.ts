import { formatDate } from "./format-date";
import type { MailContent } from "./layout";

export interface AdminActivationMailParams {
  link: string;
  expiresAt: Date;
}

export const adminActivation = ({ link, expiresAt }: AdminActivationMailParams): MailContent => ({
  subject: "Ativação da conta de administrador do DevTrack",
  preheader: "Ative a conta de administrador do DevTrack.",
  heading: "Ativação da conta de administrador",
  paragraphs: ["Olá.", "Para ativar a conta de administrador do DevTrack, acesse o link abaixo."],
  action: { label: "Ativar conta", url: link },
  expiry: `O link é válido até ${formatDate(expiresAt)}.`,
  reason: "Você recebeu este e-mail porque este endereço foi indicado como administrador do DevTrack.",
});
