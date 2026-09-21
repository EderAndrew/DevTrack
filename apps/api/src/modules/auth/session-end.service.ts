import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { SessionService } from "./session.service";

/** Ending the caller's own sessions (FR-025): this one, or all of them including this one. */
@Injectable()
export class SessionEndService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async logout(auth: AuthContext, requestId: string | null): Promise<void> {
    await this.prisma.runInTransaction(async (tx) => {
      if (!(await this.sessions.revoke(auth.sessionId, "LOGOUT", tx))) return;
      await this.audit.record(tx, {
        type: "session.revoked",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "SESSION",
        targetId: auth.sessionId,
        requestId,
        metadata: { reason: "LOGOUT" },
      });
    });
  }

  async logoutAll(auth: AuthContext, requestId: string | null): Promise<void> {
    await this.prisma.runInTransaction(async (tx) => {
      const count = await this.sessions.revokeAllForUser(tx, auth.userId, "LOGOUT_ALL");
      await this.audit.record(tx, {
        type: "session.revoked_all",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "USER",
        targetId: auth.userId,
        requestId,
        metadata: { reason: "LOGOUT_ALL", count },
      });
    });
  }
}
