import { formatDate } from "./format-date";
import type { MailContent } from "./layout";

export interface ClassInvitationMailParams {
  className: string;
  classCode: string;
  period: string | null;
  teacherName: string;
  link: string;
  expiresAt: Date;
}

/** 003 contracts/mail-delivery.md: class, teacher, deadline and the acceptance link only. */
export const classInvitation = ({ className, classCode, period, teacherName, link, expiresAt }: ClassInvitationMailParams): MailContent => ({
  subject: `Convite para a turma ${className}`,
  preheader: `${teacherName} convidou você para a turma ${className} no DevTrack.`,
  heading: `Convite para a turma ${className}`,
  paragraphs: [
    "Olá.",
    `Você foi convidado para participar da turma ${className} no DevTrack.`,
    period ? `Código ${classCode} · ${period}` : `Código ${classCode}`,
    `Professor(a): ${teacherName}`,
  ],
  action: { label: "Aceitar convite", url: link },
  expiry: `Aceite até ${formatDate(expiresAt)}.`,
  reason: "Você recebeu este e-mail porque um(a) professor(a) convidou este endereço para uma turma do DevTrack.",
});
