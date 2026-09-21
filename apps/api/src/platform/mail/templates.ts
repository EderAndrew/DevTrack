/** Transactional e-mail templates (pt-BR, plain text). Parameters never include passwords. */

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const formatDate = (date: Date) => dateFormat.format(date);

export interface TemplateParams {
  "verify-email": { name: string; link: string };
  "signup-existing-account": { name: string; loginLink: string; resetLink: string };
  "password-reset": { name: string; link: string };
  "invitation-teacher": { displayName: string; link: string; expiresAt: Date };
  "invitation-manager": { displayName: string; link: string; expiresAt: Date };
  "admin-activation": { link: string; expiresAt: Date };
}

export type TemplateName = keyof TemplateParams;

export interface RenderedMail {
  subject: string;
  text: string;
}

const footer = "\n\nSe você não esperava esta mensagem, ignore-a.\n— DevTrack";

const renderers: { [K in TemplateName]: (params: TemplateParams[K]) => RenderedMail } = {
  "verify-email": ({ name, link }) => ({
    subject: "Confirme seu e-mail no DevTrack",
    text: `Olá, ${name}.\n\nPara confirmar seu e-mail, acesse o link abaixo (válido por 24 horas):\n\n${link}${footer}`,
  }),
  "signup-existing-account": ({ name, loginLink, resetLink }) => ({
    subject: "Tentativa de cadastro no DevTrack",
    text:
      `Olá, ${name}.\n\nAlguém tentou criar uma conta no DevTrack com este e-mail, mas ele já possui uma conta.\n\n` +
      `Para entrar: ${loginLink}\nSe esqueceu a senha: ${resetLink}${footer}`,
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
};

export function renderTemplate<K extends TemplateName>(template: K, params: TemplateParams[K]): RenderedMail {
  return renderers[template](params);
}
