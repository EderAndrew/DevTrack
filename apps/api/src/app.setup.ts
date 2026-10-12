import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { Logger } from "nestjs-pino";
import type { AppConfig } from "./platform/config/config.schema";
import { AppException } from "./platform/http/errors";

/** Room for the fields around the largest JSON input (ids, keys, nesting). */
const JSON_ENVELOPE_BYTES = 64 * 1024;

/** The provider notice route (017 research N6) and its body limit (contracts/configuration.md). */
const NOTICE_PATH = /^\/api\/mail\/notices\/[^/?]*(\?|$)/;
const NOTICE_MAX_BYTES = 256 * 1024;

/** HTTP settings shared by main.ts and the test application. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.disable("x-powered-by");
  // Client IP for rate limiting and access records comes from X-Forwarded-For only across
  // the configured number of trusted proxies (FR-022, FR-076).
  app.set("trust proxy", config.trustProxyHops);
  // 017: a provider notice is signed over its exact bytes, so its body is kept raw (a Buffer, JSON
  // or SNS text alike), up to 256 KB → 413; registered first, the JSON parser then skips it.
  const isNotice = (req: Request) => NOTICE_PATH.test(req.originalUrl ?? req.url ?? "");
  app.useBodyParser("raw", { type: isNotice, limit: NOTICE_MAX_BYTES });
  app.use((error: unknown, req: Request, _res: Response, next: NextFunction) => {
    const tooLarge = isNotice(req) && (error as { type?: unknown } | null)?.type === "entity.too.large";
    next(tooLarge ? new AppException("NOTICE_TOO_LARGE") : error);
  });
  // JSON bodies fit the largest accepted input (the AI execution input, 006/FR-048) plus the
  // request envelope; the services enforce their own limits with their own error codes.
  app.useBodyParser("json", { limit: config.ai.limits.maxInputBytes + JSON_ENVELOPE_BYTES });
  app.use(cookieParser());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    // Links carry single-use tokens: never leak them through Referer.
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.enableShutdownHooks();
}
