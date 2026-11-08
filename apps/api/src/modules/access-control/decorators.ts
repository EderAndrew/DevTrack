import { applyDecorators, SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "./permissions";

export const IS_PUBLIC_KEY = "access:public";
export const ALLOW_UNVERIFIED_KEY = "access:allow-unverified";
export const REQUIRED_PERMISSIONS_KEY = "access:permissions";
export const MOBILE_ACCESS_KEY = "access:mobile";
export const MOBILE_ENTRY_KEY = "access:mobile-entry";
export const MOBILE_ONLY_KEY = "access:mobile-only";

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

/**
 * 024 research Y4: the route is on the app's allowlist — a MOBILE session's bearer is accepted here (and
 * only here; anywhere else it is `403 MOBILE_ROUTE_NOT_ALLOWED`), and with no session cookie the CSRF
 * barrier does not ask for an Origin. The route's own access rule still applies.
 */
export const MobileAccess = (): RouteDecorator => SetMetadata(MOBILE_ACCESS_KEY, true);

/** 024: the app's sign-in (`POST /auth/mobile/sessions`), which may come with no Origin; only that route. */
export const MobileEntry = (): MethodDecorator => SetMetadata(MOBILE_ENTRY_KEY, true);

/**
 * 025 research N3: only the app may call the route — it is on the app's allowlist (`@MobileAccess()`) and a WEB
 * session (the cookie) gets `403 MOBILE_SESSION_REQUIRED` from `SessionGuard`, before any permission check. The
 * route's own access rule still applies to the bearer.
 */
export const MobileOnly = (): RouteDecorator => applyDecorators(SetMetadata(MOBILE_ACCESS_KEY, true), SetMetadata(MOBILE_ONLY_KEY, true));
