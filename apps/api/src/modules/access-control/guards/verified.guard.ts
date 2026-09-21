import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { emailNotVerified } from "../../../platform/http/errors";
import { ALLOW_UNVERIFIED_KEY, IS_PUBLIC_KEY } from "../decorators";

/** Protected routes require a verified e-mail unless marked `@AllowUnverified()` (FR-016). */
@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, targets)) return true;

    const { auth } = context.switchToHttp().getRequest<Request>();
    if (!auth?.emailVerified) throw emailNotVerified();
    return true;
  }
}
