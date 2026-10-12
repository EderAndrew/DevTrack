import { formatDate } from "./format-date";
import type { MailContent } from "./layout";

export interface StaffInvitationMailParams {
  displayName: string;
  link: string;
  expiresAt: Date;
}

export const invitationTeacher = ({ displayName, link, expiresAt }: StaffInvitationMailParams): MailContent => ({
  subject: "Convite para ser professor no DevTrack",
  preheader: "Você foi convidado para ser professor no DevTrack.",
  heading: "Convite para ser professor",
  paragraphs: [`Olá, ${displayName}.`, "Você foi convidado para ser professor no DevTrack."],
  action: { label: "Aceitar convite", url: link },
  expiry: `Aceite o convite até ${formatDate(expiresAt)}.`,
  reason: "Você recebeu este e-mail porque este endereço foi convidado para o DevTrack.",
});
