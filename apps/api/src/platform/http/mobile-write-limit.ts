import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import type { Tx } from "../database/transaction";
import { RateLimitService } from "../rate-limit/rate-limit.service";
import { rateLimited } from "./errors";

const MINUTE_SEC = 60;

/**
 * The app's writes per user and minute (024 contracts/http-api.md "Rate limits"): device registration and
 * exam mute share the `mobile-writes` scope, counted in `rate_limit_counters` like the other writes. 025 (analysis
 * I2) moved it to the platform so the warning's send counts in the same scope without importing `exam-alerts`.
 */
@Injectable()
export class MobileWriteLimit {
  constructor(
    private readonly rateLimit: RateLimitService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async assert(tx: Tx, userId: string): Promise<void> {
    const state = await this.rateLimit.hit("mobile-writes", userId, { limit: this.config.rateLimit.mobileWritesPerMinute, windowSec: MINUTE_SEC }, tx);
    if (state.blocked) throw rateLimited(state.retryAfterSec);
  }
}
