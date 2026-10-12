import { type DynamicModule, Global, Module } from "@nestjs/common";
import { Mailer } from "./mailer";
import { CertificateFetcher } from "./notices/certificate-fetcher";
import { MailNoticesController } from "./notices/mail-notices.controller";
import { MailNoticesService } from "./notices/mail-notices.service";
import { MailDeliveryWorker } from "./outbox/mail-delivery.worker";
import { MailOutbox } from "./outbox/mail-outbox";
import { MailSubjectRegistry } from "./outbox/mail-subject";
import { MailSendBudget } from "./outbox/send-budget";
import { SmtpMailer } from "./smtp.mailer";

/**
 * SMTP by default. Tests override the `Mailer` provider with InMemoryMailer or FailingMailer;
 * CLI runs may pass a mailer instance to `forRoot` instead. The provider notices (017 US2) come in
 * through `MailNoticesController`; tests replace `CertificateFetcher` to serve their SNS certificate.
 */
@Global()
@Module({})
export class MailModule {
  static forRoot(mailer?: Mailer): DynamicModule {
    return {
      module: MailModule,
      controllers: [MailNoticesController],
      providers: [
        mailer ? { provide: Mailer, useValue: mailer } : { provide: Mailer, useClass: SmtpMailer },
        MailSubjectRegistry,
        MailSendBudget,
        MailOutbox,
        MailDeliveryWorker,
        CertificateFetcher,
        MailNoticesService,
      ],
      exports: [Mailer, MailSubjectRegistry, MailOutbox, MailDeliveryWorker],
    };
  }
}
