import "reflect-metadata";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Abstract, Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { CLOCK, type Clock } from "../../src/platform/clock/clock";
import { type AppConfig, loadConfig } from "../../src/platform/config/config.schema";
import { PrismaService } from "../../src/platform/database/prisma.service";
import { InMemoryMailer } from "../../src/platform/mail/in-memory.mailer";
import { MailOutbox } from "../../src/platform/mail/outbox/mail-outbox";
import { Mailer } from "../../src/platform/mail/mailer";
import { SYLLABUS_WORKER_PATH } from "../../src/modules/syllabus/syllabus-worker-runner";
import { ContractConformanceInterceptor } from "./contract-conformance.interceptor";
import { assertTestDatabase } from "./env";
import { LogCapture } from "./log-capture";
import { TEST_WORKER_PATH } from "./syllabus-worker";

/**
 * Reference data seeded by migration: never truncated (010 adds the programming-language catalog; a
 * test that changes one of its rows restores it).
 */
const PRESERVED_TABLES = new Set(["roles", "permissions", "role_permissions", "programming_languages", "_prisma_migrations"]);

export interface TestAppOptions {
  /** Defaults to a fresh InMemoryMailer; pass FailingMailer to simulate SMTP outages. */
  mailer?: Mailer;
  /** Captures the API logs; by default they go to a discarded buffer to keep test output clean. */
  logs?: LogCapture;
  config?: Partial<AppConfig>;
  /** Extra controllers mounted next to the application (guard tests). */
  controllers?: Type[];
  /** Providers replaced by fixed values (e.g. the login delay). */
  overrides?: { provide: unknown; useValue: unknown }[];
  /** The server clock of request-driven rules (012 research P10); `FixedClock` in test/helpers/clock.ts. */
  clock?: Clock;
}

export interface TestApp {
  app: NestExpressApplication;
  http: Server;
  /** `http://127.0.0.1:<port>` of the listening app; supertest targets it (see createTestApp). */
  baseUrl: string;
  prisma: PrismaService;
  config: AppConfig;
  /** The InMemoryMailer when no other mailer was given. */
  mailer: InMemoryMailer;
  /** Allowed Origin sent by `api()` on every request. */
  origin: string;
  /** Also takes an abstract class used as a provider token (e.g. `FileStorage`). */
  get<T>(token: Type<T> | Abstract<T> | string | symbol): T;
  /** Waits for after-commit e-mails. */
  flushMail(): Promise<void>;
  close(): Promise<void>;
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const base = loadConfig(process.env);
  // Timers off: tests drive the maintenance, mail retry, syllabus and AI workers with `runOnce`.
  // No real AI provider, even if the shell exports OPENROUTER_API_KEY (006/SC-011, 008/FR-023).
  return {
    ...base,
    maintenanceIntervalSeconds: 0,
    mailRetryIntervalSeconds: 0,
    // 019: on, whatever the shell exports; the suites drive the worker with the FakeSandbox.
    codeRunner: { ...base.codeRunner, enabled: true },
    ...overrides,
    // 017: suites share the per-minute send budget through the database; only the FR-008 suites,
    // which set it, should ever see it run out.
    mail: { ...base.mail, sendsPerMinute: 1_000_000, ...overrides.mail },
    syllabus: { ...base.syllabus, processingIntervalSeconds: 0, ...overrides.syllabus },
    ai: {
      ...base.ai,
      intervalSeconds: 0,
      openrouter: { ...base.ai.openrouter, apiKey: null, baseUrl: null },
      // No budget unless a suite sets one (009 US8), whatever the shell exports.
      budgets: { daily: null, monthly: null, perUserMonthly: null, perAgentMonthly: null },
      ignoredVariables: [],
      ...overrides.ai,
    },
  };
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const config = testConfig(options.config);
  const mailer = options.mailer ?? new InMemoryMailer();

  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config, { logDestination: options.logs ?? new LogCapture() })],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(Mailer)
    .useValue(mailer)
    // The reading worker compiled by the global setup (test/helpers/syllabus-worker.ts).
    .overrideProvider(SYLLABUS_WORKER_PATH)
    .useValue(TEST_WORKER_PATH);
  if (options.clock) builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  for (const { provide, useValue } of options.overrides ?? []) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app, config);
  // Test-only: every response of the app is checked against @repo/contracts (002 S6, FR-002).
  app.useGlobalInterceptors(new ContractConformanceInterceptor(new Set(options.controllers ?? [])));
  await app.init();
  // Listen once on an explicit IPv4 loopback port. Handing the bare server to supertest makes it
  // listen(0) on "::" per request, and on macOS that port may already be taken on 127.0.0.1 by
  // another program — the request then reaches that program (random 401/403/socket hang up).
  await app.listen(0, "127.0.0.1");
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;

  const outbox = app.get(MailOutbox);
  return {
    app,
    http: app.getHttpServer() as Server,
    baseUrl: `http://127.0.0.1:${port}`,
    prisma: app.get(PrismaService),
    config,
    mailer: mailer as InMemoryMailer,
    origin: config.allowedOrigins[0]!,
    get: <T>(token: Type<T> | Abstract<T> | string | symbol) => app.get<T>(token as Type<T>),
    flushMail: () => outbox.flush(),
    close: () => app.close(),
  };
}

/**
 * Empties every table except the seeded reference data. `audit_events` rejects TRUNCATE by
 * trigger; `session_replication_role = replica` disables triggers for this transaction only
 * (the test role is the database owner/superuser).
 */
export async function resetDb(prisma: PrismaService): Promise<void> {
  assertTestDatabase();
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const tables = rows.map((row) => row.tablename).filter((name) => !PRESERVED_TABLES.has(name));
  if (tables.length === 0) return;
  const list = tables.map((name) => `"public"."${name}"`).join(", ");
  await prisma.$transaction([
    prisma.$executeRawUnsafe("SET LOCAL session_replication_role = replica"),
    prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`),
  ]);
}

export interface ApiClientOptions {
  cookie?: string;
  /** Overrides the allowed Origin; `null` omits the header (CSRF tests). */
  origin?: string | null;
}

/** supertest client that sends the allowed Origin and JSON bodies by default. */
export function api(t: TestApp, options: ApiClientOptions = {}) {
  const origin = options.origin === undefined ? t.origin : options.origin;
  const decorate = (req: request.Test): request.Test => {
    if (origin !== null) req.set("Origin", origin);
    if (options.cookie) req.set("Cookie", options.cookie);
    return req;
  };
  const withBody = (req: request.Test, body: object) =>
    decorate(req).set("Content-Type", "application/json").send(JSON.stringify(body));

  return {
    get: (path: string) => decorate(request(t.baseUrl).get(path)),
    post: (path: string, body: object = {}) => withBody(request(t.baseUrl).post(path), body),
    put: (path: string, body: object = {}) => withBody(request(t.baseUrl).put(path), body),
    patch: (path: string, body: object = {}) => withBody(request(t.baseUrl).patch(path), body),
    delete: (path: string, body: object = {}) => withBody(request(t.baseUrl).delete(path), body),
    /** `multipart/form-data` POST with one file (004 uploads); supertest sets the boundary. */
    upload: (path: string, file: { bytes: Buffer; filename: string; contentType?: string }, field = "file") =>
      decorate(request(t.baseUrl).post(path)).attach(field, file.bytes, {
        filename: file.filename,
        contentType: file.contentType ?? "application/octet-stream",
      }),
  };
}
