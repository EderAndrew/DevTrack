import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { type MailMessage, Mailer, type MailSendResult } from "./mailer";
import { classifySmtpError } from "./smtp-errors";
import { renderTemplate } from "./templates";

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
    const { subject, text, html } = renderTemplate(message.template, message.params as never);
    const replyTo = message.replyTo ?? this.config.mail.replyTo;
    try {
      await this.transport.sendMail({
        from: this.config.mailFrom,
        to: message.to,
        subject,
        text,
        ...(html ? { html } : {}),
        ...(message.messageId ? { messageId: message.messageId } : {}),
        ...(replyTo ? { replyTo } : {}),
      });
    } catch (error) {
      throw classifySmtpError(error);
    }
    return "SENT";
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
