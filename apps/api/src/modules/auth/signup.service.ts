import { Inject, Injectable } from "@nestjs/common";
import type { PublicAccepted, SignupRequest } from "@repo/contracts";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { RequestContext } from "../../platform/http/request-context";
import { MailDispatcher } from "../../platform/mail/mail-dispatcher";
import { RoleRepository } from "../access-control/role.repository";
import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../identity/email";
import { PasswordHasher } from "../identity/password-hasher";
import { PasswordPolicy } from "../identity/password-policy";
import { ProfileRepository } from "../identity/profile.repository";
import { UserRepository } from "../identity/user.repository";
import { PublicRateLimit } from "./public-rate-limit";
import { UserTokenService } from "./user-token.service";

/** Body of every accepted public request about an e-mail (signup, resend): reveals nothing (SC-006). */
export const PUBLIC_ACCEPTED_MESSAGE = "Se o e-mail puder ser usado, enviaremos as instruções para ele.";

/** Links of the e-mails, pointing at the web app (R18). */
export function webLinks(webOrigin: string) {
  return {
    verifyEmail: (token: string) => `${webOrigin}/verificar-email?token=${encodeURIComponent(token)}`,
    login: `${webOrigin}/entrar`,
    passwordReset: `${webOrigin}/esqueci-senha`,
    passwordResetConfirm: (token: string) => `${webOrigin}/redefinir-senha?token=${encodeURIComponent(token)}`,
    invitation: (token: string) => `${webOrigin}/convite?token=${encodeURIComponent(token)}`,
    adminActivation: (token: string) => `${webOrigin}/ativar-admin?token=${encodeURIComponent(token)}`,
  };
}

/**
 * Public self-signup (FR-010–FR-013, R16). Creates only `User` + `STUDENT` + `StudentProfile`
 * with an unverified e-mail. An e-mail that already has an account gets the very same response
 * and costs the same Argon2 hash; its owner is told by e-mail instead. Mail leaves after commit.
 */
@Injectable()
export class SignupService {
  private readonly links: ReturnType<typeof webLinks>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly rateLimit: PublicRateLimit,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly hasher: PasswordHasher,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly profiles: ProfileRepository,
    private readonly tokens: UserTokenService,
    private readonly audit: AuditService,
    private readonly mail: MailDispatcher,
  ) {
    this.links = webLinks(config.webOrigin);
  }

  async signup(input: SignupRequest, ctx: RequestContext): Promise<PublicAccepted> {
    const email = normalizeEmail(input.email);
    await this.rateLimit.enforce("signup", email, ctx);
    this.passwordPolicy.validate(input.password);
    // Always hashed, before knowing whether the e-mail is taken: both paths cost the same.
    const passwordHash = await this.hasher.hash(input.password);

    const created = await this.prisma.runInTransaction(async (tx) => {
      const user = await this.users.createIfAbsent(tx, { email, name: input.name, passwordHash });
      if (!user) return null;
      await this.roles.grant(tx, user.id, "STUDENT", null, "SELF_SIGNUP");
      await this.profiles.ensureStudentProfile(tx, user.id, user.name);
      const { token } = await this.tokens.issue(tx, user.id, "EMAIL_VERIFICATION");
      await this.audit.record(tx, {
        type: "auth.signup",
        actorType: "ANONYMOUS",
        targetType: "USER",
        targetId: user.id,
        requestId: ctx.requestId,
      });
      return { name: user.name, token };
    });

    if (created) {
      this.mail.send({
        to: email,
        template: "verify-email",
        params: { name: created.name, link: this.links.verifyEmail(created.token) },
      });
    } else {
      this.notifyExistingAccount(email);
    }
    return { message: PUBLIC_ACCEPTED_MESSAGE };
  }

  /** FR-012: the owner learns about the attempt; the lookup happens off the response path. */
  private notifyExistingAccount(email: string): void {
    this.mail.afterCommit(async () => {
      const owner = await this.users.findByEmail(email);
      if (!owner) return;
      this.mail.send({
        to: owner.email,
        template: "signup-existing-account",
        params: { name: owner.name, loginLink: this.links.login, resetLink: this.links.passwordReset },
      });
    });
  }
}
