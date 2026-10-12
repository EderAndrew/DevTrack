import type { MailContent } from "./layout";

export interface VerifyEmailMailParams {
  name: string;
  link: string;
}

export const verifyEmail = ({ name, link }: VerifyEmailMailParams): MailContent => ({
  subject: "Confirme seu e-mail no DevTrack",
  preheader: "Confirme seu e-mail para começar a usar o DevTrack.",
  heading: "Confirme seu e-mail",
  paragraphs: [`Olá, ${name}.`, "Para confirmar seu e-mail, acesse o link abaixo."],
  action: { label: "Confirmar e-mail", url: link },
  expiry: "O link é válido por 24 horas.",
  reason: "Você recebeu este e-mail porque este endereço foi informado numa conta do DevTrack.",
});
