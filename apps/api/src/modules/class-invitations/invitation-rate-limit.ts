import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { rateLimited } from "../../platform/http/errors";
import { type RateLimitState, RateLimitService } from "../../platform/rate-limit/rate-limit.service";

const HOUR_SEC = 3600;
const DAY_SEC = 24 * HOUR_SEC;

/** Who sends to whom: the teacher, and the invited e-mail in one class. */
export interface InvitationSend {
  teacherId: string;
  classId: string;
  /** Normalized. */
  email: string;
}

/**
 * Class invitation limits (FR-021, D6), counted in `RateLimitService` before anything is
 * written. Only creations and manual resends count; the delivery worker's retries never do.
 *   - sends per teacher per hour (`classInviteTeacherHourly`);
 *   - sends per invited e-mail in a class per 24 h (`classInviteDailySends`), keyed on class and
 *     e-mail rather than the invitation, so cancelling and inviting again does not reset it;
 *   - spacing between resends of one invitation (`classInviteResendSeconds`, 1 per window).
 */
@Injectable()
export class InvitationRateLimit {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Throws `429 RATE_LIMITED` with `Retry-After` when a new invitation would exceed a limit. */
  async beforeInvite(send: InvitationSend): Promise<void> {
    await this.countSend(send);
  }

  /** Same as `beforeInvite`, plus the spacing between resends of `invitationId`. */
  async beforeResend(send: InvitationSend, invitationId: string): Promise<void> {
    const { classInviteResendSeconds } = this.config.rateLimit;
    enforce(
      await this.rateLimit.hit("class_invite:resend", invitationId, { limit: 1, windowSec: classInviteResendSeconds }),
    );
    await this.countSend(send);
  }

  private async countSend({ teacherId, classId, email }: InvitationSend): Promise<void> {
    const { classInviteTeacherHourly, classInviteDailySends } = this.config.rateLimit;
    enforce(
      await this.rateLimit.hit("class_invite:teacher", teacherId, { limit: classInviteTeacherHourly, windowSec: HOUR_SEC }),
    );
    enforce(
      await this.rateLimit.hit("class_invite:email", `${classId}:${email}`, {
        limit: classInviteDailySends,
        windowSec: DAY_SEC,
      }),
    );
  }
}

function enforce(state: RateLimitState): void {
  if (state.blocked) throw rateLimited(state.retryAfterSec);
}
