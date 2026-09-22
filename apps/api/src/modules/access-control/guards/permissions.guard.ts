import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { forbidden, unauthenticated } from "../../../platform/http/errors";
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from "../decorators";
import { PermissionResolver } from "../permission-resolver";
import type { PermissionKey } from "../permissions";

/**
 * Checks the explicit permissions of `@RequirePermissions()` against the user's effective
 * permissions, loaded on every request (FR-061, FR-063). Missing capability → `403 FORBIDDEN`;
 * resource context is the services' job (scoped queries → 404).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: PermissionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const required = this.reflector.getAllAndMerge<PermissionKey[]>(REQUIRED_PERMISSIONS_KEY, targets);
    if (required.length === 0) return true;

    const { auth } = context.switchToHttp().getRequest<Request>();
    if (!auth) throw unauthenticated();

    const granted = await this.resolver.effectivePermissions(auth.userId);
    if (!required.every((key) => granted.has(key))) throw forbidden();
    return true;
  }
}
