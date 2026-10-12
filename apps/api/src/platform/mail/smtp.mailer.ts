import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createTransport, type SendMailOptions, type Transporter } from "nodemailer";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { type MailMessage, Mailer, type MailSendResult } from "./mailer";
import { classifySmtpError } from "./smtp-errors";
import { renderTemplate } from "./templates";

/**
 * The message as nodemailer sends it: `from` is `MAIL_FROM` ("DevTrack <…>"), the reply address the
 * message's or `MAIL_REPLY_TO` (017/FR-023), and both bodies of the template, which nodemailer puts
 * in one `multipart/alternative` (017/FR-019).
 */
export function composeMail(message: MailMessage, config: AppConfig): SendMailOptions {
  const { subject, text, html } = renderTemplate(message.template, message.params as never);
  const replyTo = message.replyTo ?? config.mail.replyTo;
  return {
    from: config.mailFrom,
    to: message.to,
    subject,
    text,
    html,
    ...(message.messageId ? { messageId: message.messageId } : {}),
    ...(replyTo ? { replyTo } : {}),
  };
}

/**
 * The only transport (017/FR-024): standard SMTP, configured only by environment, so changing
 * provider is changing variables. Each message carries our own Message-ID (research N5), the
 * reply address of `MAIL_REPLY_TO`, and gives up after `MAIL_SEND_TIMEOUT_SECONDS` at each step
 * (connection, greeting, socket); a failure leaves as a classified `MailSendError` (N8).
 */
@Injectable()
export class SmtpMailer extends Mailer implements OnModuleDestroy {
  private readonly transport: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
    const timeout = config.mail.sendTimeoutMs;
    this.transport = createTransport({
      url: config.smtpUrl,
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
    });
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    const mail = composeMail(message, this.config);
    try {
      await this.transport.sendMail(mail);
    } catch (error) {
      throw classifySmtpError(error);
    }
    return "SENT";
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
