import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/config.schema";
import type { Tx } from "../../database/transaction";
import { RateLimitService } from "../../rate-limit/rate-limit.service";

const MINUTE_MS = 60_000;
/** Long enough for the counter of one clock minute to outlive it; the next minute has its own key. */
const COUNTER_TTL_SEC = 300;

/**
 * `MAIL_SENDS_PER_MINUTE` (017 research N4, FR-008): sends of every instance in one minute of the
 * server clock, counted in `rate_limit_counters` under a key per minute, so the first attempts and
 * the worker share it and a `FixedClock` moves it in tests. `0` grants nothing: sending pauses and
 * every e-mail waits in the outbox, losing nothing.
 */
@Injectable()
export class MailSendBudget {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly counters: RateLimitService,
  ) {}

  /** Takes one send of the minute of `now`; false when the minute is spent (or sending is paused). */
  async take(now: Date, db?: Pick<Tx, "$queryRaw">): Promise<boolean> {
    const limit = this.config.mail.sendsPerMinute;
    if (limit <= 0) return false;
    const minute = String(Math.floor(now.getTime() / MINUTE_MS));
    const state = await this.counters.hit("mail_send_budget", minute, { limit, windowSec: COUNTER_TTL_SEC }, db);
    return !state.blocked;
  }
}
