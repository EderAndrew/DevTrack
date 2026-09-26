import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type DynamicModule, Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import type { DestinationStream } from "pino";
import type { AppConfig } from "../config/config.schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Never logged (FR-072, R12): cookies, authorization, Set-Cookie and any password/token/secret
 * field, including the AI provider key (007 FR-043). Request bodies are never logged at all (pino-http default serializers skip them).
 */
export const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.secret",
  "*.passwordHash",
  "*.tokenHash",
  "*.apiKey",
  "*.openrouter",
];

/** Accepts the caller's X-Request-Id only when it is a UUID; otherwise generates one. */
export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers["x-request-id"];
  const candidate = Array.isArray(header) ? header[0] : header;
  const id = candidate && UUID.test(candidate) ? candidate.toLowerCase() : randomUUID();
  res.setHeader("X-Request-Id", id);
  return id;
}

@Module({})
export class LoggingModule {
  /** `destination` lets tests capture the log stream (SC-005 secret scan). */
  static forRoot(config: AppConfig, destination?: DestinationStream): DynamicModule {
    const options = {
      level: config.logLevel,
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
      genReqId: requestIdFor,
      quietReqLogger: false,
    };
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: destination ? [options, destination] : options,
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
