import { Injectable } from "@nestjs/common";
import type { AccountStatus, SessionRevokeReason } from "../../generated/prisma/client";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";

/** FR-024: 8 h of inactivity, 7 days after creation in any case. */
export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** `lastUsedAt` is written at most once per minute per session (R5). */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

const SECRET_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export interface CreatedSession {
  sessionId: string;
  /** Goes only into the cookie; the database keeps its SHA-256. */
  secret: string;
  absoluteExpiresAt: Date;
}

export interface ValidSession {
  sessionId: string;
  userId: string;
  emailVerified: boolean;
  accountStatus: AccountStatus;
  absoluteExpiresAt: Date;
}

/**
 * Opaque server-side sessions (R5, FR-023–FR-026). Every revocation of all of a user's
 * sessions goes through `revokeAllForUser`, inside the transaction of the triggering event.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Tx, userId: string, now: Date = new Date()): Promise<CreatedSession> {
    const secret = generateToken();
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS);
    const session = await tx.session.create({
      data: { userId, tokenHash: hashToken(secret), createdAt: now, lastUsedAt: now, absoluteExpiresAt },
      select: { id: true },
    });
    return { sessionId: session.id, secret, absoluteExpiresAt };
  }

  /** Returns null for unknown, revoked, idle-expired or absolutely-expired sessions. */
  async validate(secret: string, now: Date = new Date()): Promise<ValidSession | null> {
    if (!SECRET_FORMAT.test(secret)) return null;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(secret) },
      select: {
        id: true,
        userId: true,
        lastUsedAt: true,
        absoluteExpiresAt: true,
        revokedAt: true,
        user: { select: { emailVerifiedAt: true, status: true } },
      },
    });
    if (!session || session.revokedAt) return null;
    if (session.absoluteExpiresAt.getTime() <= now.getTime()) return null;
    if (session.lastUsedAt.getTime() <= now.getTime() - SESSION_IDLE_TIMEOUT_MS) return null;

    if (now.getTime() - session.lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
      // Conditional so concurrent requests write once; a revocation in between wins.
      await this.prisma.session.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          lastUsedAt: { lte: new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS) },
        },
        data: { lastUsedAt: now },
      });
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      emailVerified: session.user.emailVerifiedAt !== null,
      accountStatus: session.user.status,
      absoluteExpiresAt: session.absoluteExpiresAt,
    };
  }

  /** Idempotent; returns whether this call revoked the session. */
  async revoke(
    sessionId: string,
    reason: SessionRevokeReason,
    db: Tx = this.prisma,
    now: Date = new Date(),
  ): Promise<boolean> {
    const { count } = await db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason },
    });
    return count === 1;
  }

  /** Idempotent; returns how many sessions this call revoked (FR-026). */
  async revokeAllForUser(
    tx: Tx,
    userId: string,
    reason: SessionRevokeReason,
    now: Date = new Date(),
  ): Promise<number> {
    const { count } = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason },
    });
    return count;
  }
}
