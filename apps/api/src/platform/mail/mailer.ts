import type { TemplateName, TemplateParams } from "./templates";

export type MailMessage = {
  [K in TemplateName]: {
    to: string;
    template: K;
    params: TemplateParams[K];
    /** Our own `<{deliveryId}.{attempt}@{domain}>` (017 research N5), which provider notices bring back. */
    messageId?: string;
    /** Overrides `MAIL_REPLY_TO` for this message. */
    replyTo?: string;
  };
}[TemplateName];

/**
 * Why a send failed, as a short code (never the server's message, which may carry the address):
 * the envelope or the content refused, a timeout, the credentials, the connection, or an SMTP
 * reply of the 4xx or 5xx range (017 research N8).
 */
export type MailErrorCode = "EENVELOPE" | "ETIMEDOUT" | "EAUTH" | "ECONNECTION" | "SMTP_4XX" | "SMTP_5XX";

/**
 * A classified send failure. `permanent`: the server refused this recipient or this message, so
 * another attempt would be refused too (`UNDELIVERED (REJECTED)`); otherwise the outbox tries
 * again with the 003 waits. A wrong key (`EAUTH`) is temporary: it is the configuration, not the
 * e-mail (N8).
 */
export class MailSendError extends Error {
  constructor(
    readonly code: MailErrorCode,
    readonly permanent: boolean,
  ) {
    super(`mail send failed (${code})`);
    this.name = "MailSendError";
  }
}

/** A send either goes out or throws a `MailSendError`. */
export type MailSendResult = "SENT";

/** Outgoing mail port (R11). Implementations: SmtpMailer, InMemoryMailer (tests), FailingMailer (tests). */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<MailSendResult>;
}
