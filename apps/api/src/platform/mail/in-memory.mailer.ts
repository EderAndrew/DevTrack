import { type MailMessage, Mailer } from "./mailer";
import { type RenderedMail, renderTemplate } from "./templates";

export interface SentMail extends RenderedMail {
  to: string;
  template: MailMessage["template"];
}

const LINK = /https?:\/\/\S+/g;

/** Test double: keeps every message in memory. */
export class InMemoryMailer extends Mailer {
  readonly outbox: SentMail[] = [];

  async send(message: MailMessage): Promise<void> {
    const rendered = renderTemplate(message.template, message.params as never);
    this.outbox.push({ to: message.to, template: message.template, ...rendered });
  }

  messagesFor(email: string): SentMail[] {
    return this.outbox.filter((mail) => mail.to === email);
  }

  /** First link of the most recent message sent to `email`, optionally of a given template. */
  lastLinkFor(email: string, template?: MailMessage["template"]): string | undefined {
    const mail = this.messagesFor(email)
      .filter((m) => !template || m.template === template)
      .at(-1);
    return mail?.text.match(LINK)?.[0];
  }

  /** Token query parameter of lastLinkFor(). */
  lastTokenFor(email: string, template?: MailMessage["template"]): string | undefined {
    const link = this.lastLinkFor(email, template);
    return link ? (new URL(link).searchParams.get("token") ?? undefined) : undefined;
  }

  clear(): void {
    this.outbox.length = 0;
  }
}

/** Test double: every send fails (edge case "falha no envio de e-mail"). */
export class FailingMailer extends Mailer {
  async send(): Promise<void> {
    throw new Error("SMTP unavailable");
  }
}
