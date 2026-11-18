import type { MailContent } from "./layout";

export interface ClassEnrollmentNoticeMailParams {
  className: string;
  classCode: string;
  period: string | null;
  /** The sign-in page; never a token (027/FR-034). */
  link: string;
}

/**
 * 027/FR-034 (contracts/http-api.md "Mail"): the MANAGER included an existing student in a turma. The turma's name,
 * code and period and the sign-in link; no token, teacher or subject, and nothing expires.
 */
export const classEnrollmentNotice = ({ className, classCode, period, link }: ClassEnrollmentNoticeMailParams): MailContent => ({
  subject: `Você foi incluído na turma ${className}`,
  preheader: `Você agora faz parte da turma ${className} no DevTrack.`,
  heading: `Você foi incluído na turma ${className}`,
  paragraphs: [
    "Olá.",
    `Você foi incluído na turma ${className} no DevTrack. As disciplinas dela aparecem em "Minhas turmas" ao entrar.`,
    period ? `Código ${classCode} · ${period}` : `Código ${classCode}`,
  ],
  action: { label: "Entrar no DevTrack", url: link },
  reason: "Você recebeu este e-mail porque a coordenação incluiu sua conta de aluno em uma turma do DevTrack.",
});
