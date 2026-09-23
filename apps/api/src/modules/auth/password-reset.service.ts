import { Inject, Injectable } from "@nestjs/common";
import type { MessageResponse, PublicAccepted } from "@repo/contracts";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import { tokenInvalid } from "../../platform/http/errors";
import type { RequestContext } from "../../platform/http/request-context";
import { webLinks } from "../../platform/mail/links";
import { MailDispatcher } from "../../platform/mail/mail-dispatcher";
import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../identity/email";
import { PasswordHasher } from "../identity/password-hasher";
import { PasswordPolicy } from "../identity/password-policy";
import { UserRepository } from "../identity/user.repository";
import { PublicRateLimit } from "./public-rate-limit";
import { SessionService } from "./session.service";
import { PUBLIC_ACCEPTED_MESSAGE } from "./email-verification.service";
import { UserTokenService } from "./user-token.service";

export const PASSWORD_RESET_DONE_MESSAGE = "Senha redefinida. Entre com a nova senha.";

/**
 * "Esqueci minha senha" (FR-029a–e). `request` answers the same whether or not the e-mail
 * has an account (SC-006) and mails a 1-hour single-use link only when it does. `confirm`
 * replaces the password, proves the e-mail, revokes every session and leaves the account
 * status and roles untouched — a suspended account stays suspended.
 */
@Injectable()
export class PasswordResetService {
  private readonly links: ReturnType<typeof webLinks>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly rateLimit: PublicRateLimit,
    private readonly users: UserRepository,
    private readonly tokens: UserTokenService,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly mail: MailDispatcher,
  ) {
    this.links = webLinks(config.webOrigin);
  }

  async request(rawEmail: string, ctx: RequestContext): Promise<PublicAccepted> {
    const email = normalizeEmail(rawEmail);
    await this.rateLimit.enforce("password_reset", email, ctx);

    const issued = await this.prisma.runInTransaction(async (tx) => {
      const user = await this.users.findByEmail(email, tx);
      if (!user) return null;
      const { token } = await this.tokens.issue(tx, user.id, "PASSWORD_RESET");
      await this.audit.record(tx, {
        type: "password_reset.requested",
        actorType: "ANONYMOUS",
        targetType: "USER",
        targetId: user.id,
        requestId: ctx.requestId,
      });
      return { name: user.name, token };
    });

    if (issued) {
      this.mail.send({
        to: email,
        template: "password-reset",
        params: { name: issued.name, link: this.links.passwordResetConfirm(issued.token) },
      });
    }
    return { message: PUBLIC_ACCEPTED_MESSAGE };
  }

  async confirm(token: string, password: string, ctx: RequestContext): Promise<MessageResponse> {
    await this.rateLimit.enforce("password_reset_confirm", hashToken(token), ctx);
    // Validated before the token is consumed: a weak password must not burn the link.
    this.passwordPolicy.validate(password);
    const passwordHash = await this.hasher.hash(password);

    await this.prisma.runInTransaction(async (tx) => {
      const consumed = await this.tokens.consume(tx, token, "PASSWORD_RESET");
      if (!consumed) throw tokenInvalid();
      const { userId } = consumed;

      await this.users.setPassword(tx, userId, passwordHash);
      await this.users.markEmailVerified(tx, userId);
      // Any other pending link of the account (e.g. e-mail verification) dies with the reset.
      await tx.userToken.updateMany({
        where: { userId, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      });
      const revokedSessions = await this.sessions.revokeAllForUser(tx, userId, "PASSWORD_RESET");
      await this.audit.record(tx, {
        type: "password_reset.completed",
        actorType: "ANONYMOUS",
        targetType: "USER",
        targetId: userId,
        requestId: ctx.requestId,
        metadata: { revokedSessions },
      });
    });
    return { message: PASSWORD_RESET_DONE_MESSAGE };
  }
}
