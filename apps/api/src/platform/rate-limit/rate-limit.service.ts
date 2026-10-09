import { Injectable } from "@nestjs/common";
import { CryptoService } from "../crypto/crypto.service";
import { PrismaService } from "../database/prisma.service";
import type { Tx } from "../database/transaction";

export interface RateLimitWindow {
  limit: number;
  windowSec: number;
  /** How many events this hit counts (default 1), e.g. the events of one batch (015). */
  weight?: number;
}

export interface RateLimitState {
  count: number;
  /** true when the counter is above `limit` after this hit. */
  blocked: boolean;
  retryAfterSec: number;
}

/** Progressive delay for login failures against one e-mail across origins (R8): min(250·2^(n−5), 8000) ms. */
export function progressiveDelayMs(failures: number): number {
  if (failures < 5) return 0;
  return Math.min(250 * 2 ** (failures - 5), 8_000);
}

const CLEANUP_PROBABILITY = 0.01;

/**
 * Fixed-window counters in PostgreSQL (R8, FR-022). Keys are HMACs of `scope:value`, so the
 * table never holds e-mails or IPs in clear.
 */
@Injectable()
export class RateLimitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Counts `weight` events (default one) and returns the updated state. Atomic under concurrency.
   * Inside a transaction pass its `tx`: the count then commits or rolls back with it, and the hit
   * never waits for a second pool connection while the transaction holds its locks.
   */
  async hit(scope: string, value: string, { limit, windowSec, weight = 1 }: RateLimitWindow, db: Pick<Tx, "$queryRaw"> = this.prisma): Promise<RateLimitState> {
    const key = this.crypto.hmacKey(scope, value);
    const rows = await db.$queryRaw<{ count: number; expires_at: Date }[]>`
      INSERT INTO rate_limit_counters (key, window_start, count, expires_at)
      VALUES (${key}, now(), ${weight}, now() + make_interval(secs => ${windowSec}))
      ON CONFLICT (key) DO UPDATE SET
        count        = CASE WHEN rate_limit_counters.expires_at <= now() THEN ${weight} ELSE rate_limit_counters.count + ${weight} END,
        window_start = CASE WHEN rate_limit_counters.expires_at <= now() THEN now() ELSE rate_limit_counters.window_start END,
        expires_at   = CASE WHEN rate_limit_counters.expires_at <= now()
                            THEN now() + make_interval(secs => ${windowSec})
                            ELSE rate_limit_counters.expires_at END
      RETURNING count, expires_at`;
    if (Math.random() < CLEANUP_PROBABILITY) void this.cleanupExpired().catch(() => undefined);

    const row = rows[0]!;
    return { count: row.count, blocked: row.count > limit, retryAfterSec: secondsUntil(row.expires_at) };
  }

  /** Current state without counting; `blocked` once `limit` events are already recorded. */
  async peek(scope: string, value: string, limit: number): Promise<RateLimitState> {
    const key = this.crypto.hmacKey(scope, value);
    const row = await this.prisma.rateLimitCounter.findFirst({
      where: { key, expiresAt: { gt: new Date() } },
      select: { count: true, expiresAt: true },
    });
    if (!row) return { count: 0, blocked: false, retryAfterSec: 0 };
    return { count: row.count, blocked: row.count >= limit, retryAfterSec: secondsUntil(row.expiresAt) };
  }

  async isBlocked(scope: string, value: string, limit: number): Promise<boolean> {
    return (await this.peek(scope, value, limit)).blocked;
  }

  /** Removes expired counters in a bounded batch; returns how many were removed. */
  async cleanupExpired(batchSize = 1_000): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM rate_limit_counters
      WHERE key IN (SELECT key FROM rate_limit_counters WHERE expires_at < now() LIMIT ${batchSize})`;
  }
}

function secondsUntil(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}
