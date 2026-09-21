import { DiscoveryModule, DiscoveryService } from "@nestjs/core";
import { PATH_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { AccessRecordsJob } from "../../src/modules/retention/access-records.job";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { createUser } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const DAY_MS = 24 * 3600 * 1000;
const monthsAgo = (months: number, plusDays = 0) => {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return new Date(date.getTime() - plusDays * DAY_MS);
};
const serialize = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

describe("US2 — registro de acesso (FR-076, R23)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ overrides: [{ provide: LOGIN_DELAY, useValue: async () => undefined }] });
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  const login = (email: string, password: string, ip: string) =>
    api(t).post("/api/auth/login", { email, password }).set("X-Forwarded-For", ip);

  it("login bem-sucedido grava usuário, IP de origem e data/hora; a auditoria não tem IP", async () => {
    const user = await createUser(t);
    const before = Date.now();
    expect((await login(user.email, user.password, "198.51.100.7")).status).toBe(200);

    const records = await t.prisma.$queryRaw<{ user_id: string; ip: string; occurred_at: Date }[]>`
      SELECT user_id, host(ip) AS ip, occurred_at FROM access_records`;
    expect(records).toHaveLength(1);
    expect(records[0]!.user_id).toBe(user.id);
    expect(records[0]!.ip).toBe("198.51.100.7");
    expect(Math.abs(records[0]!.occurred_at.getTime() - before)).toBeLessThan(60_000);

    expect(serialize(await t.prisma.auditEvent.findMany())).not.toContain("198.51.100.7");
  });

  it("login falho e login bloqueado não gravam", async () => {
    const user = await createUser(t);
    for (let i = 0; i < 5; i += 1) await login(user.email, "senha-errada-mas-longa", "198.51.100.8");
    expect((await login(user.email, user.password, "198.51.100.8")).status).toBe(429);
    expect(await t.prisma.accessRecord.count()).toBe(0);
  });

  describe("job access-records", () => {
    const insert = (occurredAt: Date, count = 1) =>
      t.prisma.$executeRaw`
        INSERT INTO access_records (user_id, ip, occurred_at)
        SELECT gen_random_uuid(), '203.0.113.1'::inet, ${occurredAt}::timestamptz FROM generate_series(1, ${count})`;

    it("remove só registros com mais de 6 meses e audita a contagem", async () => {
      await insert(monthsAgo(6, 1), 2);
      await insert(monthsAgo(6, -1));

      const result = await t.get(MaintenanceService).run({ job: "access-records" });
      expect(result).toEqual({ status: "completed", results: [{ job: "access-records", removed: 2 }] });
      expect(await t.prisma.accessRecord.count()).toBe(1);

      const events = await t.prisma.auditEvent.findMany({ where: { type: "access_records.purged" } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorType: "SYSTEM", metadata: { count: 2, olderThan: expect.any(String) } });
    });

    it("sem remoções não audita", async () => {
      await insert(monthsAgo(1));
      await t.get(MaintenanceService).run({ job: "access-records" });
      expect(await t.prisma.auditEvent.count({ where: { type: "access_records.purged" } })).toBe(0);
    });

    it("remove em lotes", async () => {
      await insert(monthsAgo(7), 3);
      expect(await t.get(AccessRecordsJob).run({ now: new Date(), batchSize: 2 })).toBe(3);
      expect(await t.prisma.accessRecord.count()).toBe(0);
    });
  });

  it("nenhuma rota expõe access_records", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(testConfig(), { logDestination: new LogCapture() }), DiscoveryModule],
    }).compile();
    const app = await moduleRef.init();
    try {
      const paths = app
        .get(DiscoveryService)
        .getControllers()
        .map(({ metatype }) => (metatype ? String(Reflect.getMetadata(PATH_METADATA, metatype)) : ""));
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.filter((path) => /access/i.test(path))).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
