import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { type MailMessage, Mailer } from "./mailer";
import { renderTemplate } from "./templates";

@Injectable()
export class SmtpMailer extends Mailer implements OnModuleDestroy {
  private readonly transport: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
    this.transport = createTransport(config.smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    const { subject, text, html } = renderTemplate(message.template, message.params as never);
    await this.transport.sendMail({ from: this.config.mailFrom, to: message.to, subject, text, ...(html ? { html } : {}) });
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
