import { type DynamicModule, Global, Module } from "@nestjs/common";
import { MailDispatcher } from "./mail-dispatcher";
import { Mailer } from "./mailer";
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
      providers: [mailer ? { provide: Mailer, useValue: mailer } : { provide: Mailer, useClass: SmtpMailer }, MailDispatcher],
      exports: [Mailer, MailDispatcher],
    };
  }
}
