import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** Authenticated principal attached to the request by SessionGuard. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  emailVerified: boolean;
}

declare module "express-serve-static-core" {
  interface Request {
    /** Set by SessionGuard when the request carries a valid session. */
    auth?: AuthContext;
  }
}

export interface RequestContext {
  requestId: string | null;
  /** Client IP as resolved by Express with `trust proxy = TRUST_PROXY_HOPS`. */
  ip: string | null;
  auth: AuthContext | null;
}

export function getRequestContext(req: Request): RequestContext {
  return {
    // req.id is assigned by pino-http (genReqId in LoggingModule).
    requestId: typeof req.id === "string" ? req.id : null,
    ip: req.ip ?? null,
    auth: req.auth ?? null,
  };
}

/** `@Ctx() ctx: RequestContext` */
export const Ctx = createParamDecorator((_data: unknown, context: ExecutionContext): RequestContext =>
  getRequestContext(context.switchToHttp().getRequest<Request>()),
);
