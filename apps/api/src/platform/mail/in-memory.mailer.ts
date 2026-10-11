import { type MailMessage, Mailer, MailSendError, type MailSendResult } from "./mailer";
import { type RenderedMail, renderTemplate } from "./templates";

export interface SentMail extends RenderedMail {
  to: string;
  template: MailMessage["template"];
  /** The Message-ID the outbox gave this attempt (017 research N5); null when none was given. */
  messageId: string | null;
  replyTo: string | null;
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
  /** Whether the failures of `failNext` are permanent refusals (017 research N8). */
  private permanentFailures = false;

  async send(message: MailMessage): Promise<MailSendResult> {
    const rendered = renderTemplate(message.template, message.params as never);
    const mail = {
      to: message.to,
      template: message.template,
      messageId: message.messageId ?? null,
      replyTo: message.replyTo ?? null,
      ...rendered,
    };
    if (this.failing || this.failuresLeft > 0) {
      const permanent = !this.failing && this.permanentFailures;
      if (this.failuresLeft > 0) this.failuresLeft -= 1;
      this.failed.push(mail);
      throw permanent ? new MailSendError("EENVELOPE", true) : new MailUnavailableError();
    }
    this.outbox.push(mail);
    return "SENT";
  }

  /** The next `count` sends fail: the server down (`temporary`) or the address refused (`permanent`). */
  failNext(count: number, mode: "temporary" | "permanent" = "temporary"): void {
    this.failuresLeft = count;
    this.permanentFailures = mode === "permanent";
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

/**
 * How a `FailingMailer` fails (017 research N8, N14): the server down (temporary, the outbox
 * retries), the recipient refused (permanent, "Não entregue"), or wrong credentials (temporary,
 * logged as a configuration problem).
 */
export type FailingMode = "temporary" | "permanent" | "auth";

const FAILURES: Record<FailingMode, () => MailSendError> = {
  temporary: () => new MailSendError("ECONNECTION", false),
  permanent: () => new MailSendError("EENVELOPE", true),
  auth: () => new MailSendError("EAUTH", false),
};

/** Test double: every send fails (edge case "falha no envio de e-mail"), `temporary` by default. */
export class FailingMailer extends Mailer {
  /** Every message it was asked to send, for tests that check what would have gone out. */
  readonly attempted: MailMessage[] = [];

  constructor(public mode: FailingMode = "temporary") {
    super();
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    this.attempted.push(message);
    throw FAILURES[this.mode]();
  }
}
