import { formatDate } from "./format-date";
import type { StaffInvitationMailParams } from "./invitation-teacher";
import type { MailContent } from "./layout";

export const invitationManager = ({ displayName, link, expiresAt }: StaffInvitationMailParams): MailContent => ({
  subject: "Convite para ser gestor de cadastros no DevTrack",
  preheader: "Você foi convidado para ser gestor de cadastros no DevTrack.",
  heading: "Convite para ser gestor de cadastros",
  paragraphs: [`Olá, ${displayName}.`, "Você foi convidado para ser gestor de cadastros no DevTrack."],
  action: { label: "Aceitar convite", url: link },
  expiry: `Aceite o convite até ${formatDate(expiresAt)}.`,
  reason: "Você recebeu este e-mail porque este endereço foi convidado para o DevTrack.",
});
