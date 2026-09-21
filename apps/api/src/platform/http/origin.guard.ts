import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { originNotAllowed } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF barrier (R6), applied before any other guard: unsafe methods must come from an
 * allowed Origin and carry a JSON body type. Together with SameSite=Lax cookies this
 * rules out cross-site form posts.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: ReadonlySet<string>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.allowed = new Set(config.allowedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    const contentType = req.headers["content-type"] ?? "";
    const isJson = contentType.split(";")[0]?.trim().toLowerCase() === "application/json";

    if (!origin || !this.allowed.has(origin) || !isJson) throw originNotAllowed();
    return true;
  }
}
