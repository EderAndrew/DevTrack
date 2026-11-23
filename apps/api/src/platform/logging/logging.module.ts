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
  // 028 research HI6: the student's search; its copy in `req.url` is rewritten by `serializeRequest`.
  "req.query.q",
];

const SEARCH_PARAM = /(^|&)q=[^&#]*/g;

/**
 * 028 research HI6: the student's search (`GET /me/history?q=…`) travels in the query string, and pino-http logs
 * `req.url`; the value of any `q` parameter is replaced by `[REDACTED]` (the path and the other parameters stay, for
 * debugging). `REDACT_PATHS` can't do this: it redacts whole fields, not a part of the URL.
 */
export function redactSearchInUrl(url: string): string {
  const mark = url.indexOf("?");
  if (mark === -1) return url;
  return url.slice(0, mark + 1) + url.slice(mark + 1).replace(SEARCH_PARAM, "$1q=[REDACTED]");
}

/** Runs after pino-http's default request serializer (`wrapSerializers`), on its plain `{ url, … }` object. */
function serializeRequest(req: { url?: unknown }) {
  if (typeof req.url === "string") req.url = redactSearchInUrl(req.url);
  return req;
}

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
      serializers: { req: serializeRequest },
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
