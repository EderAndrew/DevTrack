import { type MailMessage, Mailer } from "./mailer";
import { type RenderedMail, renderTemplate } from "./templates";

export interface SentMail extends RenderedMail {
  to: string;
  template: MailMessage["template"];
}

const LINK = /https?:\/\/\S+/g;

/** What an unavailable SMTP server raises: `code` is what delivery rows record. */
export class MailUnavailableError extends Error {
  readonly code = "ECONNREFUSED";

  constructor() {
    super("SMTP unavailable");
    this.name = "MailUnavailableError";
  }
}

/**
 * Test double: keeps every message in memory. It can also fail on demand (`failNext`,
 * `setFailing`); failed messages go to `failed` instead of `outbox`. Off by default.
 */
export class InMemoryMailer extends Mailer {
  readonly outbox: SentMail[] = [];
  readonly failed: SentMail[] = [];
  private failuresLeft = 0;
  private failing = false;

  async send(message: MailMessage): Promise<void> {
    const rendered = renderTemplate(message.template, message.params as never);
    const mail = { to: message.to, template: message.template, ...rendered };
    if (this.failing || this.failuresLeft > 0) {
      if (this.failuresLeft > 0) this.failuresLeft -= 1;
      this.failed.push(mail);
      throw new MailUnavailableError();
    }
    this.outbox.push(mail);
  }

  /** The next `count` sends fail. */
  failNext(count: number): void {
    this.failuresLeft = count;
  }

  /** Every send fails until called with `false`. */
  setFailing(failing: boolean): void {
    this.failing = failing;
    if (!failing) this.failuresLeft = 0;
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
    this.failed.length = 0;
  }
}

/** Test double: every send fails (edge case "falha no envio de e-mail"). */
export class FailingMailer extends Mailer {
  async send(): Promise<void> {
    throw new Error("SMTP unavailable");
  }
}
