import { Injectable } from "@nestjs/common";
import type { MobileLoginRequest, MobileSession } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { AppException, notFound } from "../../platform/http/errors";
import type { AuthContext, RequestContext } from "../../platform/http/request-context";
import { PermissionResolver } from "../access-control/permission-resolver";
import { AuditService } from "../audit/audit.service";
import { UserRepository } from "../identity/user.repository";
import { LoginService } from "./login.service";
import { MeService } from "./me.service";
import { SessionService } from "./session.service";

/** The permission of the web's exam room (018); the app is the same room on the phone (024/FR-002). */
const APP_PERMISSION = "chamada.registrar";

/**
 * The app's sign-in and sign-out (024/US1, research Y3, contracts/http-api.md). The credentials go
 * through the web login's `authenticate` (same answer, limits and Argon2, 024/FR-001); then, before
 * anything is created, the account must be ACTIVE, verified and hold `chamada.registrar`, or the answer
 * is `403 MOBILE_NOT_ALLOWED` with no session (FR-002). The session is the MOBILE kind of the same opaque
 * session (30 d idle / 90 d), its secret returned once in the body and stored only as a hash (FR-003).
 */
@Injectable()
export class MobileSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logins: LoginService,
    private readonly sessions: SessionService,
    private readonly permissions: PermissionResolver,
    private readonly users: UserRepository,
    private readonly me: MeService,
    private readonly audit: AuditService,
  ) {}

  async signIn(input: MobileLoginRequest, ctx: RequestContext): Promise<MobileSession> {
    const { user, rehash } = await this.logins.authenticate(input, ctx);
    const allowed =
      user.status === "ACTIVE" && user.emailVerifiedAt !== null && (await this.permissions.effectivePermissions(user.id)).has(APP_PERMISSION);
    if (!allowed) {
      // Written on its own: the password was right, so this is the account's own fact, not a guess.
      await this.audit.record(this.prisma, {
        type: "mobile_session.refused",
        actorType: "USER",
        actorUserId: user.id,
        targetType: "USER",
        targetId: user.id,
        requestId: ctx.requestId,
        metadata: { code: "MOBILE_NOT_ALLOWED" },
      });
      throw new AppException("MOBILE_NOT_ALLOWED");
    }

    const session = await this.prisma.runInTransaction(async (tx) => {
      if (rehash) await this.users.setPassword(tx, user.id, rehash);
      const created = await this.sessions.create(tx, user.id, new Date(), "MOBILE");
      await tx.accessRecord.create({ data: { userId: user.id, ip: ctx.ip ?? "0.0.0.0" } });
      await this.audit.record(tx, {
        type: "mobile_session.created",
        actorType: "USER",
        actorUserId: user.id,
        targetType: "SESSION",
        targetId: created.sessionId,
        requestId: ctx.requestId,
        metadata: { sessionId: created.sessionId },
      });
      return created;
    });

    return { token: session.secret, expiresAt: session.absoluteExpiresAt.toISOString(), user: await this.me.get(user.id) };
  }

  /**
   * "Sair" (024/US1-4): the session is revoked (`LOGOUT`) and its device deleted in one transaction, so
   * the phone stops getting alerts at once. A web session has no app session to end (404).
   */
  async signOut(auth: AuthContext, requestId: string | null): Promise<void> {
    if (auth.client !== "MOBILE") throw notFound();
    await this.prisma.runInTransaction(async (tx) => {
      const device = await tx.mobileDevice.findUnique({ where: { sessionId: auth.sessionId }, select: { id: true } });
      if (device) {
        await tx.mobileDevice.delete({ where: { id: device.id } });
        await this.audit.record(tx, {
          type: "mobile_device.removed",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "MOBILE_DEVICE",
          targetId: device.id,
          requestId,
          metadata: { reason: "LOGOUT" },
        });
      }
      if (!(await this.sessions.revoke(auth.sessionId, "LOGOUT", tx))) return;
      await this.audit.record(tx, {
        type: "mobile_session.ended",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "SESSION",
        targetId: auth.sessionId,
        requestId,
        metadata: { sessionId: auth.sessionId },
      });
    });
  }
}
