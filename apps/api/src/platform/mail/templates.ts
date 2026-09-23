/**
 * Transactional e-mail templates (pt-BR, plain text; `class-invitation` also has an HTML body).
 * Parameters never include passwords.
 */

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const formatDate = (date: Date) => dateFormat.format(date);

export interface TemplateParams {
  "verify-email": { name: string; link: string };
  "password-reset": { name: string; link: string };
  "invitation-teacher": { displayName: string; link: string; expiresAt: Date };
  "invitation-manager": { displayName: string; link: string; expiresAt: Date };
  "admin-activation": { link: string; expiresAt: Date };
  "class-invitation": {
    className: string;
    classCode: string;
    period: string | null;
    teacherName: string;
    link: string;
    expiresAt: Date;
  };
}

export type TemplateName = keyof TemplateParams;

export interface RenderedMail {
  subject: string;
  text: string;
  /** Every interpolated value is HTML-escaped. */
  html?: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);

const footer = "\n\nSe você não esperava esta mensagem, ignore-a.\n— DevTrack";

const renderers: { [K in TemplateName]: (params: TemplateParams[K]) => RenderedMail } = {
  "verify-email": ({ name, link }) => ({
    subject: "Confirme seu e-mail no DevTrack",
    text: `Olá, ${name}.\n\nPara confirmar seu e-mail, acesse o link abaixo (válido por 24 horas):\n\n${link}${footer}`,
  }),
  "password-reset": ({ name, link }) => ({
    subject: "Redefinição de senha do DevTrack",
    text:
      `Olá, ${name}.\n\nPara definir uma nova senha, acesse o link abaixo (válido por 1 hora):\n\n${link}\n\n` +
      `Ao concluir, todas as sessões abertas da sua conta serão encerradas.${footer}`,
  }),
  "invitation-teacher": ({ displayName, link, expiresAt }) => ({
    subject: "Convite para ser professor no DevTrack",
    text: `Olá, ${displayName}.\n\nVocê foi convidado para ser professor no DevTrack. Aceite o convite até ${formatDate(expiresAt)}:\n\n${link}${footer}`,
  }),
  "invitation-manager": ({ displayName, link, expiresAt }) => ({
    subject: "Convite para ser gestor de cadastros no DevTrack",
    text: `Olá, ${displayName}.\n\nVocê foi convidado para ser gestor de cadastros no DevTrack. Aceite o convite até ${formatDate(expiresAt)}:\n\n${link}${footer}`,
  }),
  "admin-activation": ({ link, expiresAt }) => ({
    subject: "Ativação da conta de administrador do DevTrack",
    text: `Olá.\n\nPara ativar a conta de administrador do DevTrack, acesse o link abaixo até ${formatDate(expiresAt)}:\n\n${link}${footer}`,
  }),
  // 003 contracts/mail-delivery.md: class, teacher, deadline and the acceptance link only.
  "class-invitation": ({ className, classCode, period, teacherName, link, expiresAt }) => {
    const classLine = period ? `Código ${classCode} · ${period}` : `Código ${classCode}`;
    const deadline = formatDate(expiresAt);
    const e = escapeHtml;
    return {
      subject: `Convite para a turma ${className}`,
      text:
        `Olá.\n\nVocê foi convidado para participar da turma ${className} no DevTrack.\n${classLine}\n` +
        `Professor(a): ${teacherName}\n\nAceite até ${deadline}:\n\nAceitar convite: ${link}${footer}`,
      html:
        `<p>Olá.</p><p>Você foi convidado para participar da turma <strong>${e(className)}</strong> no DevTrack.<br>` +
        `${e(classLine)}<br>Professor(a): ${e(teacherName)}</p><p>Aceite até ${e(deadline)}.</p>` +
        `<p><a href="${e(link)}">Aceitar convite</a></p>` +
        `<p>Se você não esperava esta mensagem, ignore-a.<br>— DevTrack</p>`,
    };
  },
};

export function renderTemplate<K extends TemplateName>(template: K, params: TemplateParams[K]): RenderedMail {
  return renderers[template](params);
}
