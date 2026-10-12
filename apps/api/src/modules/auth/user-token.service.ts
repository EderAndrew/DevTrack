import { Injectable } from "@nestjs/common";
import type { TokenPurpose } from "../../generated/prisma/client";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import type { Tx } from "../../platform/database/transaction";

/** Validity of each single-use token (FR-013, FR-029a). */
export const USER_TOKEN_TTL_MS: Readonly<Record<TokenPurpose, number>> = {
  EMAIL_VERIFICATION: 24 * 3600 * 1000,
  PASSWORD_RESET: 3600 * 1000,
};

export interface IssuedToken {
  /** Goes only into the e-mailed link; the database keeps its SHA-256. */
  token: string;
  expiresAt: Date;
}

/**
 * Single-use tokens of `user_tokens` (R7, FR-013–FR-015). At most one token per user and
 * purpose is live: issuing a new one invalidates the previous one, so a resent link replaces
 * the old one. Consumption is one conditional UPDATE, atomic under concurrency.
 */
@Injectable()
export class UserTokenService {
  async issue(tx: Tx, userId: string, purpose: TokenPurpose, now: Date = new Date()): Promise<IssuedToken> {
    // Two requests at once (a double click, 017/US1-4) would both insert a live token and one would
    // hit `user_tokens_live_user_purpose_key` (500). A lock of this user and purpose serializes them;
    // nothing else takes it, so it cannot form a cycle with a confirmation (user_tokens → users).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`user_token:${userId}:${purpose}`}, 0))`;
    await tx.userToken.updateMany({
      where: { userId, purpose, usedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + USER_TOKEN_TTL_MS[purpose]);
    await tx.userToken.create({
      data: { userId, purpose, tokenHash: hashToken(token), expiresAt, createdAt: now },
    });
    return { token, expiresAt };
  }

  /** Marks a live token as used; null when it is unknown, used, invalidated or expired. */
  async consume(tx: Tx, token: string, purpose: TokenPurpose): Promise<{ userId: string } | null> {
    const rows = await tx.$queryRaw<{ user_id: string }[]>`
      UPDATE user_tokens SET used_at = now()
      WHERE token_hash = ${hashToken(token)}
        AND purpose = ${purpose}::token_purpose
        AND used_at IS NULL
        AND invalidated_at IS NULL
        AND expires_at > now()
      RETURNING user_id`;
    return rows[0] ? { userId: rows[0].user_id } : null;
  }

  /** Owner of an already consumed token, for idempotent replays. */
  async findUsed(tx: Tx, token: string, purpose: TokenPurpose): Promise<{ userId: string } | null> {
    const row = await tx.userToken.findFirst({
      where: { tokenHash: hashToken(token), purpose, usedAt: { not: null } },
      select: { userId: true },
    });
    return row;
  }
}
