import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { unauthenticated } from "../../../platform/http/errors";
import { SessionCookie } from "../../auth/session-cookie";
import { SessionService } from "../../auth/session.service";
import { IS_PUBLIC_KEY } from "../decorators";

/**
 * Deny-by-default (R9): every route requires a valid session of an `ACTIVE` account unless
 * marked `@Public()`. Suspended accounts get `401` like a missing session (their sessions are
 * already revoked, FR-026). On public routes a valid session is attached but never required.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();

    const secret = SessionCookie.read(req);
    const session = secret ? await this.sessions.validate(secret) : null;
    if (session && session.accountStatus === "ACTIVE") {
      req.auth = { sessionId: session.sessionId, userId: session.userId, emailVerified: session.emailVerified };
    }

    if (isPublic) return true;
    if (!req.auth) throw unauthenticated();
    return true;
  }
}
