import { formatDate } from "./format-date";
import type { MailContent } from "./layout";

export interface ClassInvitationMailParams {
  className: string;
  classCode: string;
  period: string | null;
  link: string;
  expiresAt: Date;
}

/** 003 contracts/mail-delivery.md, 027/FR-010: the turma (name, code, period), the deadline and the link; no teacher. */
export const classInvitation = ({ className, classCode, period, link, expiresAt }: ClassInvitationMailParams): MailContent => ({
  subject: `Convite para a turma ${className}`,
  preheader: `Você foi convidado para a turma ${className} no DevTrack.`,
  heading: `Convite para a turma ${className}`,
  paragraphs: [
    "Olá.",
    `Você foi convidado para participar da turma ${className} no DevTrack.`,
    period ? `Código ${classCode} · ${period}` : `Código ${classCode}`,
  ],
  action: { label: "Aceitar convite", url: link },
  expiry: `Aceite até ${formatDate(expiresAt)}.`,
  reason: "Você recebeu este e-mail porque a coordenação convidou este endereço para uma turma do DevTrack.",
});
