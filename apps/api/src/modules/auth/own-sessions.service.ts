import { Injectable } from "@nestjs/common";
import type { SessionView } from "@repo/contracts";
import type { Session } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { AuthContext } from "../../platform/http/request-context";
import { findOwnedOrNotFound } from "../access-control/resource-context";
import { AuditService } from "../audit/audit.service";
import { SESSION_IDLE_TIMEOUT_MS, SessionService } from "./session.service";

type SessionRow = Pick<Session, "id" | "createdAt" | "lastUsedAt" | "absoluteExpiresAt">;

/** `SessionView` of the contract: `id` is the public identifier, never the secret; dates as ISO (002 S4). */
export function toSessionView(session: SessionRow, currentSessionId: string): SessionView {
  const idleExpiry = session.lastUsedAt.getTime() + SESSION_IDLE_TIMEOUT_MS;
  return {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: new Date(Math.min(idleExpiry, session.absoluteExpiresAt.getTime())).toISOString(),
    current: session.id === currentSessionId,
  };
}

const SELECT = { id: true, createdAt: true, lastUsedAt: true, absoluteExpiresAt: true } as const;

/**
 * The caller's own sessions (FR-027, FR-062). Every query is scoped by `userId`, so a session
 * of someone else is simply not found (404), exactly like a nonexistent one.
 */
@Injectable()
export class OwnSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext, now: Date = new Date()): Promise<SessionView[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId: auth.userId, ...activeAt(now) },
      select: SELECT,
      orderBy: { lastUsedAt: "desc" },
    });
    return rows.map((row) => toSessionView(row, auth.sessionId));
  }

  async get(auth: AuthContext, id: string, now: Date = new Date()): Promise<SessionView> {
    const row = await findOwnedOrNotFound(() =>
      this.prisma.session.findFirst({ where: { id, userId: auth.userId, ...activeAt(now) }, select: SELECT }),
    );
    return toSessionView(row, auth.sessionId);
  }

  /** Idempotent for an own session already ended; returns whether it is the caller's current one. */
  async revoke(auth: AuthContext, id: string, requestId: string | null): Promise<{ current: boolean }> {
    await findOwnedOrNotFound(() =>
      this.prisma.session.findFirst({ where: { id, userId: auth.userId }, select: { id: true } }),
    );
    await this.prisma.runInTransaction(async (tx) => {
      if (!(await this.sessions.revoke(id, "USER_REVOKED", tx))) return;
      await this.audit.record(tx, {
        type: "session.revoked",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "SESSION",
        targetId: id,
        requestId,
        metadata: { reason: "USER_REVOKED" },
      });
    });
    return { current: id === auth.sessionId };
  }
}

function activeAt(now: Date) {
  return {
    revokedAt: null,
    lastUsedAt: { gt: new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS) },
    absoluteExpiresAt: { gt: now },
  };
}
