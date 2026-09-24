import { type CanActivate, type ExecutionContext, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { originNotAllowed } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const ACCEPTS_MULTIPART_KEY = "http:accepts-multipart";

/**
 * Lets an upload route receive `multipart/form-data` besides JSON (004 E5). The allowed-Origin
 * rule still applies; every other route keeps refusing any body type but JSON.
 */
export const AcceptsMultipart = (): MethodDecorator & ClassDecorator => SetMetadata(ACCEPTS_MULTIPART_KEY, true);

/**
 * CSRF barrier (R6), applied before any other guard: unsafe methods must come from an
 * allowed Origin and carry a JSON body type (or multipart, on routes marked with
 * `@AcceptsMultipart()`). Together with SameSite=Lax cookies this rules out cross-site form posts.
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
    const acceptsBody =
      mediaType === "application/json" || (mediaType === "multipart/form-data" && this.acceptsMultipart(context));

    if (!origin || !this.allowed.has(origin) || !acceptsBody) throw originNotAllowed();
    return true;
  }

  private acceptsMultipart(context: ExecutionContext): boolean {
    return Boolean(
      this.reflector.getAllAndOverride<boolean>(ACCEPTS_MULTIPART_KEY, [context.getHandler(), context.getClass()]),
    );
  }
}
