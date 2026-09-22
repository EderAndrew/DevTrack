import type { TemplateName, TemplateParams } from "./templates";

export type MailMessage = {
  [K in TemplateName]: { to: string; template: K; params: TemplateParams[K] };
}[TemplateName];

/** Outgoing mail port (R11). Implementations: SmtpMailer, InMemoryMailer (tests), FailingMailer (tests). */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}
