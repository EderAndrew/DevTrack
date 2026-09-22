import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { Logger } from "nestjs-pino";
import type { AppConfig } from "./platform/config/config.schema";

/** HTTP settings shared by main.ts and the test application. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.disable("x-powered-by");
  // Client IP for rate limiting and access records comes from X-Forwarded-For only across
  // the configured number of trusted proxies (FR-022, FR-076).
  app.set("trust proxy", config.trustProxyHops);
  app.use(cookieParser());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    // Links carry single-use tokens: never leak them through Referer.
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.enableShutdownHooks();
}
