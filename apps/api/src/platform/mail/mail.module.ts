import { Global, Module } from "@nestjs/common";
import { MailDispatcher } from "./mail-dispatcher";
import { Mailer } from "./mailer";
import { SmtpMailer } from "./smtp.mailer";

/** Tests override the `Mailer` provider with InMemoryMailer or FailingMailer. */
@Global()
@Module({
  providers: [{ provide: Mailer, useClass: SmtpMailer }, MailDispatcher],
  exports: [Mailer, MailDispatcher],
})
export class MailModule {}
