import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import { rateLimited } from "../../platform/http/errors";
import type { RequestContext } from "../../platform/http/request-context";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";

/** Public flows limited per origin and per target e-mail or token (FR-022). */
export type PublicFlow =
  | "signup"
  | "resend"
  | "admin_activation"
  | "admin_activation_preview"
  | "invitation_accept"
  | "invitation_preview";

/** What the per-target counter is keyed on, as named in the audit scope. */
const TARGET_KIND: Record<PublicFlow, "email" | "token"> = {
  signup: "email",
  resend: "email",
  admin_activation: "token",
  admin_activation_preview: "token",
  invitation_accept: "token",
  invitation_preview: "token",
};

/**
 * Limits for requests that do not authenticate (FR-022): at most `publicTarget` requests per
 * target (e-mail, or the hash of a token) and `publicOrigin` per client IP in each window. The same answer is given
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
  async enforce(flow: PublicFlow, target: string, ctx: RequestContext): Promise<void> {
    const { publicOrigin, publicTarget, windowSeconds } = this.config.rateLimit;
    const origin = await this.rateLimit.hit(`${flow}:origin`, ctx.ip ?? "unknown", {
      limit: publicOrigin,
      windowSec: windowSeconds,
    });
    if (origin.blocked) await this.block(`${flow}_origin`, origin.retryAfterSec, ctx);

    const kind = TARGET_KIND[flow];
    const perTarget = await this.rateLimit.hit(`${flow}:${kind}`, target, { limit: publicTarget, windowSec: windowSeconds });
    if (perTarget.blocked) await this.block(`${flow}_${kind}`, perTarget.retryAfterSec, ctx);
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
