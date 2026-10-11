import { type DynamicModule, Global, Module } from "@nestjs/common";
import { Mailer } from "./mailer";
import { MailDeliveryWorker } from "./outbox/mail-delivery.worker";
import { MailOutbox } from "./outbox/mail-outbox";
import { MailSubjectRegistry } from "./outbox/mail-subject";
import { MailSendBudget } from "./outbox/send-budget";
import { SmtpMailer } from "./smtp.mailer";

/**
 * SMTP by default. Tests override the `Mailer` provider with InMemoryMailer or FailingMailer;
 * CLI runs may pass a mailer instance to `forRoot` instead.
 */
@Global()
@Module({})
export class MailModule {
  static forRoot(mailer?: Mailer): DynamicModule {
    return {
      module: MailModule,
      providers: [
        mailer ? { provide: Mailer, useValue: mailer } : { provide: Mailer, useClass: SmtpMailer },
        MailSubjectRegistry,
        MailSendBudget,
        MailOutbox,
        MailDeliveryWorker,
      ],
      exports: [Mailer, MailSubjectRegistry, MailOutbox, MailDeliveryWorker],
    };
  }
}
