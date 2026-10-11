import { Injectable } from "@nestjs/common";
import type { EmailVerifiedResponse, PublicAccepted } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { tokenInvalid } from "../../platform/http/errors";
import type { RequestContext } from "../../platform/http/request-context";
import { MailOutbox } from "../../platform/mail/outbox/mail-outbox";
import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../identity/email";
import { UserRepository } from "../identity/user.repository";
import { AccountMailSubjects } from "./account.mail-subjects";
import { PublicRateLimit } from "./public-rate-limit";
import { UserTokenService } from "./user-token.service";

/** Body of every accepted public request about an e-mail (resend, reset request): reveals nothing (SC-006). */
export const PUBLIC_ACCEPTED_MESSAGE = "Se o e-mail puder ser usado, enviaremos as instruções para ele.";

/**
 * E-mail verification (FR-014, FR-015). `verify` is idempotent: replaying a link that already
 * verified its account succeeds without effect; any other unusable token is `TOKEN_INVALID`.
 * `resend` answers the same whatever the e-mail, and only mails unverified active accounts.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: PublicRateLimit,
    private readonly users: UserRepository,
    private readonly tokens: UserTokenService,
    private readonly audit: AuditService,
    private readonly outbox: MailOutbox,
    private readonly mails: AccountMailSubjects,
  ) {}

  async verify(token: string, ctx: RequestContext): Promise<EmailVerifiedResponse> {
    await this.prisma.runInTransaction(async (tx) => {
      const consumed = await this.tokens.consume(tx, token, "EMAIL_VERIFICATION");
      if (!consumed) {
        const used = await this.tokens.findUsed(tx, token, "EMAIL_VERIFICATION");
        const owner = used && (await this.users.findById(used.userId, tx));
        if (owner?.emailVerifiedAt) return;
        throw tokenInvalid();
      }

      if (!(await this.users.markEmailVerified(tx, consumed.userId))) return;
      const bySelf = ctx.auth?.userId === consumed.userId;
      await this.audit.record(tx, {
        type: "auth.email_verified",
        actorType: bySelf ? "USER" : "ANONYMOUS",
        actorUserId: bySelf ? consumed.userId : null,
        targetType: "USER",
        targetId: consumed.userId,
        requestId: ctx.requestId,
      });
    });
    return { emailVerified: true };
  }

  async resend(rawEmail: string, ctx: RequestContext): Promise<PublicAccepted> {
    const email = normalizeEmail(rawEmail);
    await this.rateLimit.enforce("resend", email, ctx);

    const issued = await this.prisma.runInTransaction(async (tx) => {
      const user = await this.users.findByEmail(email, tx);
      if (!user || user.emailVerifiedAt || user.status !== "ACTIVE") return null;
      const { token } = await this.tokens.issue(tx, user.id, "EMAIL_VERIFICATION");
      // 017: the e-mail is written with the request and sent after the commit, off the response path.
      const deliveryId = await this.outbox.schedule(tx, "VERIFY_EMAIL", user.id);
      return { deliveryId, mail: this.mails.verificationMail({ email, name: user.name }, token) };
    });

    if (issued) this.outbox.attemptNow(issued.deliveryId, issued.mail);
    return { message: PUBLIC_ACCEPTED_MESSAGE };
  }
}
