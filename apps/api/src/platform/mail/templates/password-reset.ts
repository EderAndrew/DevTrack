import type { MailContent } from "./layout";

export interface PasswordResetMailParams {
  name: string;
  link: string;
}

export const passwordReset = ({ name, link }: PasswordResetMailParams): MailContent => ({
  subject: "Redefinição de senha do DevTrack",
  preheader: "Defina uma nova senha para a sua conta do DevTrack.",
  heading: "Redefinição de senha",
  paragraphs: [
    `Olá, ${name}.`,
    "Para definir uma nova senha, acesse o link abaixo.",
    "Ao concluir, todas as sessões abertas da sua conta serão encerradas.",
  ],
  action: { label: "Definir nova senha", url: link },
  expiry: "O link é válido por 1 hora.",
  reason: "Você recebeu este e-mail porque foi pedida a redefinição da senha da conta deste endereço no DevTrack.",
});
