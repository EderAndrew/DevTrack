import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "./permissions";

export const IS_PUBLIC_KEY = "access:public";
export const ALLOW_UNVERIFIED_KEY = "access:allow-unverified";
export const REQUIRED_PERMISSIONS_KEY = "access:permissions";

type RouteDecorator = MethodDecorator & ClassDecorator;

/**
 * Opt-out of the deny-by-default guards: the route needs no session (FR-060, R9). A valid
 * session cookie is still resolved, so public routes with an optional session can use it.
 */
export const Public = (): RouteDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Session required, but the e-mail may still be unverified (FR-016). */
export const AllowUnverified = (): RouteDecorator => SetMetadata(ALLOW_UNVERIFIED_KEY, true);

/** Verified session plus every listed permission (FR-060, FR-061). */
export const RequirePermissions = (...keys: [PermissionKey, ...PermissionKey[]]): RouteDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, keys);
