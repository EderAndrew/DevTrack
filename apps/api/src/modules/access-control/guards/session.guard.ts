import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { readBearer } from "../../../platform/http/bearer";
import { mobileRouteNotAllowed, unauthenticated } from "../../../platform/http/errors";
import { SessionCookie } from "../../auth/session-cookie";
import { SessionService } from "../../auth/session.service";
import { IS_PUBLIC_KEY, MOBILE_ACCESS_KEY, MOBILE_ENTRY_KEY } from "../decorators";

/**
 * Deny-by-default (R9): every route requires a valid session of an `ACTIVE` account unless
 * marked `@Public()`. Suspended accounts get `401` like a missing session (their sessions are
 * already revoked, FR-026). On public routes a valid session is attached but never required.
 *
 * 024 research Y4: the session cookie is a WEB session only. With no cookie, a bearer is a MOBILE session,
 * accepted only on `@MobileAccess()` routes; on any other route (but the app's sign-in, which ignores it)
 * it is `403 MOBILE_ROUTE_NOT_ALLOWED`, so a leaked app secret reads the exam room and nothing else.
 * With both, the cookie decides and the bearer is ignored.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const req = context.switchToHttp().getRequest<Request>();

    const cookie = SessionCookie.read(req);
    const bearer = cookie ? null : readBearer(req);
    let session = null;
    let client: "WEB" | "MOBILE" = "WEB";
    if (cookie) {
      session = await this.sessions.validate(cookie, "WEB");
    } else if (bearer && !this.reflector.getAllAndOverride<boolean>(MOBILE_ENTRY_KEY, targets)) {
      if (!this.reflector.getAllAndOverride<boolean>(MOBILE_ACCESS_KEY, targets)) throw mobileRouteNotAllowed();
      session = await this.sessions.validate(bearer, "MOBILE");
      client = "MOBILE";
    }
    if (session && session.accountStatus === "ACTIVE") {
      req.auth = { sessionId: session.sessionId, userId: session.userId, emailVerified: session.emailVerified, client };
    }

    if (isPublic) return true;
    if (!req.auth) throw unauthenticated();
    return true;
  }
}
