import "reflect-metadata";
import type { Server } from "node:http";
import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { type AppConfig, loadConfig } from "../../src/platform/config/config.schema";
import { PrismaService } from "../../src/platform/database/prisma.service";
import { InMemoryMailer } from "../../src/platform/mail/in-memory.mailer";
import { MailDispatcher } from "../../src/platform/mail/mail-dispatcher";
import { Mailer } from "../../src/platform/mail/mailer";
import { assertTestDatabase } from "./env";
import { LogCapture } from "./log-capture";

/** Reference data seeded by migration: never truncated. */
const PRESERVED_TABLES = new Set(["roles", "permissions", "role_permissions", "_prisma_migrations"]);

export interface TestAppOptions {
  /** Defaults to a fresh InMemoryMailer; pass FailingMailer to simulate SMTP outages. */
  mailer?: Mailer;
  /** Captures the API logs; by default they go to a discarded buffer to keep test output clean. */
  logs?: LogCapture;
  config?: Partial<AppConfig>;
  /** Extra controllers mounted next to the application (guard tests). */
  controllers?: Type[];
}

export interface TestApp {
  app: NestExpressApplication;
  http: Server;
  prisma: PrismaService;
  config: AppConfig;
  /** The InMemoryMailer when no other mailer was given. */
  mailer: InMemoryMailer;
  /** Allowed Origin sent by `api()` on every request. */
  origin: string;
  get<T>(token: Type<T> | string | symbol): T;
  /** Waits for after-commit e-mails. */
  flushMail(): Promise<void>;
  close(): Promise<void>;
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig(process.env), maintenanceIntervalSeconds: 0, ...overrides };
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const config = testConfig(options.config);
  const mailer = options.mailer ?? new InMemoryMailer();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config, { logDestination: options.logs ?? new LogCapture() })],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app, config);
  await app.init();

  const dispatcher = app.get(MailDispatcher);
  return {
    app,
    http: app.getHttpServer() as Server,
    prisma: app.get(PrismaService),
    config,
    mailer: mailer as InMemoryMailer,
    origin: config.allowedOrigins[0]!,
    get: <T>(token: Type<T> | string | symbol) => app.get<T>(token as Type<T>),
    flushMail: () => dispatcher.flush(),
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
    get: (path: string) => decorate(request(t.http).get(path)),
    post: (path: string, body: object = {}) => withBody(request(t.http).post(path), body),
    patch: (path: string, body: object = {}) => withBody(request(t.http).patch(path), body),
    delete: (path: string) => withBody(request(t.http).delete(path), {}),
  };
}
