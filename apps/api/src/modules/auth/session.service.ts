import { Injectable } from "@nestjs/common";
import type { AccountStatus, SessionClient, SessionRevokeReason } from "../../generated/prisma/client";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AuditService } from "../audit/audit.service";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** FR-024: 8 h of inactivity, 7 days after creation in any case. */
export const SESSION_IDLE_TIMEOUT_MS = 8 * HOUR_MS;
export const SESSION_ABSOLUTE_TTL_MS = 7 * DAY_MS;

/**
 * The lifetime of each kind of session (024 research Y3, contracts/configuration.md): the web's is
 * unchanged; the app's MOBILE session lasts 30 days without use or 90 days after creation (024/FR-004).
 */
export const SESSION_LIFETIMES: Record<SessionClient, { idleMs: number; absoluteMs: number }> = {
  WEB: { idleMs: SESSION_IDLE_TIMEOUT_MS, absoluteMs: SESSION_ABSOLUTE_TTL_MS },
  MOBILE: { idleMs: 30 * DAY_MS, absoluteMs: 90 * DAY_MS },
};
/** `lastUsedAt` is written at most once per minute per session (R5). */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

const SECRET_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export interface CreatedSession {
  sessionId: string;
  /** Goes only into the cookie (or, for MOBILE, the app's login answer); the database keeps its SHA-256. */
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
 * Since 024 a session has a kind (`client`): the web's cookie (WEB) or the app's bearer (MOBILE), each
 * with its lifetime and accepted only through its own channel; every revocation also deletes the
 * revoked sessions' push devices in the same transaction (constitution 3.7.0, research Y9).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(tx: Tx, userId: string, now: Date = new Date(), client: SessionClient = "WEB"): Promise<CreatedSession> {
    const secret = generateToken();
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_LIFETIMES[client].absoluteMs);
    const session = await tx.session.create({
      data: { userId, tokenHash: hashToken(secret), createdAt: now, lastUsedAt: now, absoluteExpiresAt, client },
      select: { id: true },
    });
    return { sessionId: session.id, secret, absoluteExpiresAt };
  }

  /**
   * Returns null for unknown, revoked, idle-expired or absolutely-expired sessions, and for a session of
   * another kind than the channel it came through (a WEB secret as a bearer, a MOBILE one in the cookie).
   * A valid call renews `lastUsedAt`; only requests call it, so delivering an alert never counts as use.
   */
  async validate(secret: string, client: SessionClient = "WEB", now: Date = new Date()): Promise<ValidSession | null> {
    if (!SECRET_FORMAT.test(secret)) return null;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(secret) },
      select: {
        id: true,
        userId: true,
        lastUsedAt: true,
        absoluteExpiresAt: true,
        revokedAt: true,
        client: true,
        user: { select: { emailVerifiedAt: true, status: true } },
      },
    });
    if (!session || session.revokedAt || session.client !== client) return null;
    if (session.absoluteExpiresAt.getTime() <= now.getTime()) return null;
    if (session.lastUsedAt.getTime() <= now.getTime() - SESSION_LIFETIMES[client].idleMs) return null;

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

  /** Idempotent; returns whether this call revoked the session. Its push device goes with it (024). */
  async revoke(
    sessionId: string,
    reason: SessionRevokeReason,
    db: Tx = this.prisma,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (db === this.prisma) return this.prisma.runInTransaction((tx) => this.revoke(sessionId, reason, tx, now));
    const devices = await db.mobileDevice.findMany({ where: { sessionId, session: { revokedAt: null } }, select: { id: true } });
    const { count } = await db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason },
    });
    if (count === 1) await this.removeDevices(db, devices);
    return count === 1;
  }

  /** Idempotent; returns how many sessions this call revoked (FR-026). Their push devices go with them (024). */
  async revokeAllForUser(
    tx: Tx,
    userId: string,
    reason: SessionRevokeReason,
    now: Date = new Date(),
  ): Promise<number> {
    const devices = await tx.mobileDevice.findMany({ where: { userId, session: { revokedAt: null } }, select: { id: true } });
    const { count } = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason },
    });
    await this.removeDevices(tx, devices);
    return count;
  }

  /**
   * 024 (constitution 3.7.0, research Y9, contracts/audit-events.md): a revoked session's push device is
   * deleted in the revocation's transaction, one `mobile_device.removed` `SESSION_REVOKED` (SYSTEM) each.
   * The token is never read here.
   */
  private async removeDevices(tx: Tx, devices: readonly { id: string }[]): Promise<void> {
    if (devices.length === 0) return;
    await tx.mobileDevice.deleteMany({ where: { id: { in: devices.map((device) => device.id) } } });
    for (const device of devices) {
      await this.audit.record(tx, {
        type: "mobile_device.removed",
        actorType: "SYSTEM",
        actorUserId: null,
        targetType: "MOBILE_DEVICE",
        targetId: device.id,
        requestId: null,
        metadata: { reason: "SESSION_REVOKED" },
      });
    }
  }
}
