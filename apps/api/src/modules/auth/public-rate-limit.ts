import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import { rateLimited } from "../../platform/http/errors";
import type { RequestContext } from "../../platform/http/request-context";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";

/** Public flows limited per origin and per target e-mail (FR-022). */
export type PublicFlow = "signup" | "resend";

/**
 * Limits for requests that do not authenticate (FR-022): at most `publicTarget` requests per
 * target e-mail and `publicOrigin` per client IP in each window. The same answer is given
 * whether or not the e-mail has an account, so the limit itself reveals nothing (SC-006).
 * Counter keys are HMACs (R8); the audit event carries only the scope.
 */
@Injectable()
export class PublicRateLimit {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rateLimit: RateLimitService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Counts this request; throws `429 RATE_LIMITED` with `Retry-After` when over a limit. */
  async enforce(flow: PublicFlow, email: string, ctx: RequestContext): Promise<void> {
    const { publicOrigin, publicTarget, windowSeconds } = this.config.rateLimit;
    const origin = await this.rateLimit.hit(`${flow}:origin`, ctx.ip ?? "unknown", {
      limit: publicOrigin,
      windowSec: windowSeconds,
    });
    if (origin.blocked) await this.block(`${flow}_origin`, origin.retryAfterSec, ctx);

    const target = await this.rateLimit.hit(`${flow}:email`, email, { limit: publicTarget, windowSec: windowSeconds });
    if (target.blocked) await this.block(`${flow}_email`, target.retryAfterSec, ctx);
  }

  private async block(scope: string, retryAfterSec: number, ctx: RequestContext): Promise<never> {
    await this.audit.record(this.prisma, {
      type: "auth.rate_limit.blocked",
      actorType: "ANONYMOUS",
      requestId: ctx.requestId,
      metadata: { scope },
    });
    throw rateLimited(retryAfterSec);
  }
}
