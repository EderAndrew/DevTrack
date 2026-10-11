import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import type { Tx } from "../../platform/database/transaction";
import { webLinks } from "../../platform/mail/links";
import type { DueDelivery, PrepareResult, PreparedMail } from "../../platform/mail/outbox/mail-subject";
import { MailSubjectRegistry } from "../../platform/mail/outbox/mail-subject";
import { UserTokenService } from "./user-token.service";

/**
 * The account e-mails (017 research N3): e-mail verification and password reset. The subject is
 * the user; a retry issues a new `user_tokens` row of the purpose, which invalidates the unused
 * older ones (the previous link dies). Discarded when the e-mail no longer makes sense: already
 * verified (`NOT_NEEDED`) or the account `SUSPENDED` (`REVOKED`).
 */
@Injectable()
export class AccountMailSubjects implements OnModuleInit {
  private readonly links: ReturnType<typeof webLinks>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly registry: MailSubjectRegistry,
    private readonly tokens: UserTokenService,
  ) {
    this.links = webLinks(config.webOrigin);
  }

  onModuleInit(): void {
    this.registry.register({ kind: "VERIFY_EMAIL", prepare: (tx, delivery) => this.prepareVerification(tx, delivery) });
    this.registry.register({ kind: "PASSWORD_RESET", prepare: (tx, delivery) => this.prepareReset(tx, delivery) });
  }

  verificationMail(user: { email: string; name: string }, token: string): PreparedMail {
    return { to: user.email, template: "verify-email", params: { name: user.name, link: this.links.verifyEmail(token) } };
  }

  resetMail(user: { email: string; name: string }, token: string): PreparedMail {
    return { to: user.email, template: "password-reset", params: { name: user.name, link: this.links.passwordResetConfirm(token) } };
  }

  private async prepareVerification(tx: Tx, delivery: DueDelivery): Promise<PrepareResult> {
    const user = await this.lockUser(tx, delivery.userId!);
    if (user.emailVerifiedAt) return { discard: "NOT_NEEDED" };
    if (user.status === "SUSPENDED") return { discard: "REVOKED" };
    // The link's validity runs from the real send time, as on the request path.
    const { token } = await this.tokens.issue(tx, user.id, "EMAIL_VERIFICATION");
    return { mail: this.verificationMail(user, token) };
  }

  private async prepareReset(tx: Tx, delivery: DueDelivery): Promise<PrepareResult> {
    const user = await this.lockUser(tx, delivery.userId!);
    if (user.status === "SUSPENDED") return { discard: "REVOKED" };
    const { token } = await this.tokens.issue(tx, user.id, "PASSWORD_RESET");
    return { mail: this.resetMail(user, token) };
  }

  private async lockUser(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.user.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, name: true, status: true, emailVerifiedAt: true } });
  }
}
