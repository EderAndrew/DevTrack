import { type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { MOBILE_ACCESS_KEY, MOBILE_ENTRY_KEY } from "../../modules/access-control/decorators";
import { SessionCookie } from "../../modules/auth/session-cookie";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { readBearer } from "./bearer";
import { originNotAllowed } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const ACCEPTS_MULTIPART_KEY = "http:accepts-multipart";

/**
 * Lets an upload route receive `multipart/form-data` besides JSON (004 E5). The allowed-Origin
 * rule still applies; every other route keeps refusing any body type but JSON.
 */
export const AcceptsMultipart = (): MethodDecorator & ClassDecorator => SetMetadata(ACCEPTS_MULTIPART_KEY, true);

export const PROVIDER_NOTICE_KEY = "http:provider-notice";

/**
 * The e-mail provider's notice route (017 research N6): a server-to-server call with no `Origin`,
 * posting `application/json` (Resend) or `text/plain` (SNS). It carries no session to forge, and
 * the route authenticates the provider's signature itself, so the CSRF barrier only checks the
 * body type there. Only `POST /mail/notices/:provider` is marked (route-declarations.spec.ts).
 */
export const ProviderNotice = (): MethodDecorator => SetMetadata(PROVIDER_NOTICE_KEY, true);

/**
 * CSRF barrier (R6), applied before any other guard: unsafe methods must come from an
 * allowed Origin and carry a JSON body type (or multipart, on routes marked with
 * `@AcceptsMultipart()`); the provider notice route (`@ProviderNotice()`) needs no Origin. Together with SameSite=Lax cookies this rules out cross-site form posts.
 *
 * 024 research Y4: two exceptions for the app, both still JSON only — its sign-in (`@MobileEntry()`) and a
 * request authenticated by a bearer with no session cookie on an `@MobileAccess()` route may come with
 * no Origin (an Origin present must still be allowed). A browser never adds the bearer by itself, so such
 * a request can't be forged cross-site; a request with the cookie keeps the full rule.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: ReadonlySet<string>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly reflector: Reflector,
  ) {
    this.allowed = new Set(config.allowedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    const mediaType = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (this.marked(PROVIDER_NOTICE_KEY, context)) {
      if (mediaType === "application/json" || mediaType === "text/plain") return true;
      throw originNotAllowed();
    }
    if (this.mobileWithoutOrigin(req, context)) {
      if (mediaType === "application/json" && (!origin || this.allowed.has(origin))) return true;
      throw originNotAllowed();
    }
    const acceptsBody =
      mediaType === "application/json" || (mediaType === "multipart/form-data" && this.marked(ACCEPTS_MULTIPART_KEY, context));

    if (!origin || !this.allowed.has(origin) || !acceptsBody) throw originNotAllowed();
    return true;
  }

  /** The app's sign-in, or a bearer request with no session cookie on a route of the app's allowlist. */
  private mobileWithoutOrigin(req: Request, context: ExecutionContext): boolean {
    if (this.marked(MOBILE_ENTRY_KEY, context)) return true;
    return this.marked(MOBILE_ACCESS_KEY, context) && readBearer(req) !== null && SessionCookie.read(req) === null;
  }

  private marked(key: string, context: ExecutionContext): boolean {
    return Boolean(this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]));
  }
}
