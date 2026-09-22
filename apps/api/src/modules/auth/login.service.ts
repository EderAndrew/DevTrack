import { Inject, Injectable } from "@nestjs/common";
import type { LoginRequest, MeView } from "@repo/contracts";
import { setTimeout as sleep } from "node:timers/promises";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import { accountSuspended, invalidCredentials, rateLimited } from "../../platform/http/errors";
import type { RequestContext } from "../../platform/http/request-context";
import { progressiveDelayMs, RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../identity/email";
import { PasswordHasher } from "../identity/password-hasher";
import { UserRepository } from "../identity/user.repository";
import { MeService } from "./me.service";
import { SessionService } from "./session.service";

/** `(ms) => Promise<void>` used for the progressive delay; tests replace it to avoid sleeping. */
export const LOGIN_DELAY = Symbol("LOGIN_DELAY");
export type LoginDelay = (ms: number) => Promise<void>;
export const defaultLoginDelay: LoginDelay = async (ms) => {
  if (ms > 0) await sleep(ms);
};

/** Failures against one e-mail, across origins, that raise `auth.rate_limit.alert` (R8). */
export const LOGIN_ALERT_THRESHOLD = 10;

const SCOPE = {
  emailOrigin: "login:email_origin",
  origin: "login:origin",
  email: "login:email",
} as const;

export interface LoginResult {
  /** Goes only into the cookie. */
  secret: string;
  absoluteExpiresAt: Date;
  user: MeView;
}

/**
 * E-mail + password authentication (FR-020–FR-024, R8, R16).
 *
 * Only failures are counted: 5 per e-mail + origin block that combination, 100 per origin
 * block the origin, and failures per e-mail across origins only slow down (progressive
 * delay) and alert, so an attacker can never lock the owner out (US2-4). Unknown e-mails
 * spend the same Argon2 work as wrong passwords, and both get the same answer (FR-021).
 * A suspended account is revealed only to whoever knows its password.
 */
@Injectable()
export class LoginService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGIN_DELAY) private readonly delay: LoginDelay,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly hasher: PasswordHasher,
    private readonly users: UserRepository,
    private readonly sessions: SessionService,
    private readonly me: MeService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginRequest, ctx: RequestContext): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const ip = ctx.ip ?? "unknown";
    const { loginEmailOriginFailures, loginOriginFailures, windowSeconds } = this.config.rateLimit;
    const emailOrigin = `${email}|${ip}`;

    const pairBlock = await this.rateLimit.peek(SCOPE.emailOrigin, emailOrigin, loginEmailOriginFailures);
    if (pairBlock.blocked) await this.block("login_email_origin", pairBlock.retryAfterSec, ctx);
    const originBlock = await this.rateLimit.peek(SCOPE.origin, ip, loginOriginFailures);
    if (originBlock.blocked) await this.block("login_origin", originBlock.retryAfterSec, ctx);

    const { count: emailFailures } = await this.rateLimit.peek(SCOPE.email, email, Number.MAX_SAFE_INTEGER);
    await this.delay(progressiveDelayMs(emailFailures));

    const user = await this.users.findByEmail(email);
    const valid = user ? await this.hasher.verify(user.passwordHash, input.password) : await this.hasher.verifyDummy(input.password);

    if (!user || !valid) {
      const window = { windowSec: windowSeconds };
      await this.rateLimit.hit(SCOPE.emailOrigin, emailOrigin, { ...window, limit: loginEmailOriginFailures });
      await this.rateLimit.hit(SCOPE.origin, ip, { ...window, limit: loginOriginFailures });
      const acrossOrigins = await this.rateLimit.hit(SCOPE.email, email, { ...window, limit: LOGIN_ALERT_THRESHOLD });
      if (acrossOrigins.count === LOGIN_ALERT_THRESHOLD) {
        await this.audit.record(this.prisma, {
          type: "auth.rate_limit.alert",
          actorType: "SYSTEM",
          targetType: user ? "USER" : null,
          targetId: user?.id ?? null,
          requestId: ctx.requestId,
          metadata: { failuresAcrossOrigins: LOGIN_ALERT_THRESHOLD },
        });
      }
      throw invalidCredentials();
    }

    if (user.status === "SUSPENDED") throw accountSuspended();

    const rehash = this.hasher.needsRehash(user.passwordHash) ? await this.hasher.hash(input.password) : null;
    const session = await this.prisma.runInTransaction(async (tx) => {
      if (rehash) await this.users.setPassword(tx, user.id, rehash);
      const created = await this.sessions.create(tx, user.id);
      // Express always resolves an address for HTTP requests; the fallback only keeps the column valid.
      await tx.accessRecord.create({ data: { userId: user.id, ip: ctx.ip ?? "0.0.0.0" } });
      await this.audit.record(tx, {
        type: "auth.login.succeeded",
        actorType: "USER",
        actorUserId: user.id,
        targetType: "SESSION",
        targetId: created.sessionId,
        requestId: ctx.requestId,
        metadata: { sessionId: created.sessionId },
      });
      return created;
    });

    return {
      secret: session.secret,
      absoluteExpiresAt: session.absoluteExpiresAt,
      user: await this.me.get(user.id),
    };
  }

  private async block(scope: "login_email_origin" | "login_origin", retryAfterSec: number, ctx: RequestContext): Promise<never> {
    await this.audit.record(this.prisma, {
      type: "auth.rate_limit.blocked",
      actorType: "ANONYMOUS",
      requestId: ctx.requestId,
      metadata: { scope },
    });
    throw rateLimited(retryAfterSec);
  }
}
