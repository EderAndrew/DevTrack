import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseMaintenanceArgs, runMaintenanceCli } from "../../src/cli/maintenance.command";
import { LockKey } from "../../src/platform/database/transaction";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

describe("maintenance (R21, contracts/maintenance-jobs.md)", () => {
  let t: TestApp;
  let maintenance: MaintenanceService;

  beforeAll(async () => {
    t = await createTestApp();
    maintenance = t.get(MaintenanceService);
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  const insertAudit = (occurredAt: Date, count = 1) =>
    t.prisma.$executeRaw`
      INSERT INTO audit_events (occurred_at, type, actor_type, metadata)
      SELECT ${occurredAt}::timestamptz, 'auth.signup', 'ANONYMOUS', '{}'::jsonb FROM generate_series(1, ${count})`;

  const ago = (years: number) => new Date(Date.now() - years * YEAR_MS);

  describe("locking", () => {
    it("does nothing while another instance holds MAINTENANCE_LOCK", async () => {
      await insertAudit(ago(6));
      const other = new Client({ connectionString: t.config.databaseUrl });
      await other.connect();
      try {
        await other.query("SELECT pg_advisory_lock($1::bigint)", [LockKey.MAINTENANCE_LOCK.toString()]);
        expect(await maintenance.run()).toEqual({ status: "skipped" });
        expect(await t.prisma.auditEvent.count()).toBe(1);
      } finally {
        await other.end();
      }
      expect((await maintenance.run()).status).toBe("completed");
      expect(await t.prisma.auditEvent.count({ where: { type: "auth.signup" } })).toBe(0);
    });

    it("two simultaneous runs → only one works, nothing removed twice", async () => {
      await insertAudit(ago(6), 3);
      const results = await Promise.all([maintenance.run(), maintenance.run()]);
      expect(results.map((r) => r.status).sort()).toEqual(["completed", "skipped"]);
      const purged = await t.prisma.auditEvent.findMany({ where: { type: "audit.purged" } });
      expect(purged).toHaveLength(1);
      expect(purged[0]!.metadata).toMatchObject({ count: 3 });
    });

    it("releases the lock after a run", async () => {
      await maintenance.run();
      const probe = new Client({ connectionString: t.config.databaseUrl });
      await probe.connect();
      try {
        const { rows } = await probe.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS locked", [
          LockKey.MAINTENANCE_LOCK.toString(),
        ]);
        expect(rows[0]!.locked).toBe(true);
      } finally {
        await probe.end();
      }
    });
  });

  describe("audit-events job (FR-077)", () => {
    it("removes only rows older than 5 years and audits audit.purged", async () => {
      await insertAudit(ago(6), 2);
      await insertAudit(ago(4.9));
      await insertAudit(new Date());

      const result = await maintenance.run({ job: "audit-events" });

      expect(result).toEqual({ status: "completed", results: [{ job: "audit-events", removed: 2 }] });
      expect(await t.prisma.auditEvent.count({ where: { type: "auth.signup" } })).toBe(2);
      const purged = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "audit.purged" } });
      expect(purged.actorType).toBe("SYSTEM");
      expect(purged.metadata).toMatchObject({ count: 2, olderThan: expect.any(String) });
      const olderThan = new Date((purged.metadata as { olderThan: string }).olderThan);
      expect(Math.abs(olderThan.getTime() - ago(5).getTime())).toBeLessThan(2 * 24 * 3600 * 1000);
    });

    it("records nothing when there is nothing to remove", async () => {
      await insertAudit(ago(1));
      expect(await maintenance.run({ job: "audit-events" })).toMatchObject({ results: [{ removed: 0 }] });
      expect(await t.prisma.auditEvent.count({ where: { type: "audit.purged" } })).toBe(0);
    });

    it("works in batches of 1000, one audit event per batch", async () => {
      await insertAudit(ago(6), 2_500);
      expect(await maintenance.run({ job: "audit-events" })).toMatchObject({ results: [{ removed: 2_500 }] });
      const counts = (await t.prisma.auditEvent.findMany({ where: { type: "audit.purged" }, orderBy: { id: "asc" } })).map(
        (event) => (event.metadata as { count: number }).count,
      );
      expect(counts).toEqual([1_000, 1_000, 500]);
    });

    it("DELETE outside the job and any UPDATE keep failing", async () => {
      await insertAudit(ago(6));
      await insertAudit(new Date());
      await expect(t.prisma.$executeRaw`DELETE FROM audit_events`).rejects.toThrow();
      await expect(t.prisma.$executeRaw`UPDATE audit_events SET type = 'x'`).rejects.toThrow();
      await expect(
        t.prisma.$transaction([
          t.prisma.$executeRaw`SELECT set_config('devtrack.audit_purge', 'on', true)`,
          t.prisma.$executeRaw`UPDATE audit_events SET type = 'x'`,
        ]),
      ).rejects.toThrow();
      // Even with the purge flag, recent rows stay.
      await expect(
        t.prisma.$transaction([
          t.prisma.$executeRaw`SELECT set_config('devtrack.audit_purge', 'on', true)`,
          t.prisma.$executeRaw`DELETE FROM audit_events WHERE occurred_at > now() - interval '1 day'`,
        ]),
      ).rejects.toThrow();
      await expect(t.prisma.$executeRaw`TRUNCATE audit_events`).rejects.toThrow();
      expect(await t.prisma.auditEvent.count()).toBe(2);
    });
  });

  describe("rate-limit-counters job", () => {
    it("removes only expired counters", async () => {
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 60_000);
      await t.prisma.rateLimitCounter.createMany({
        data: [
          { key: "expired-1", windowStart: past, count: 3, expiresAt: past },
          { key: "expired-2", windowStart: past, count: 1, expiresAt: past },
          { key: "live", windowStart: past, count: 2, expiresAt: future },
        ],
      });
      expect(await maintenance.run({ job: "rate-limit-counters" })).toEqual({
        status: "completed",
        results: [{ job: "rate-limit-counters", removed: 2 }],
      });
      expect((await t.prisma.rateLimitCounter.findMany()).map((c) => c.key)).toEqual(["live"]);
    });
  });

  describe("CLI maintenance:run", () => {
    const io = () => {
      const out: string[] = [];
      const err: string[] = [];
      return { out, err, io: { out: (l: string) => void out.push(l), err: (l: string) => void err.push(l) } };
    };

    it("--job with an unknown name → exit 1 without touching the database", async () => {
      const { err, io: sink } = io();
      expect(await runMaintenanceCli(["--job", "tudo"], process.env, sink)).toBe(1);
      expect(err.join("\n")).toContain("Job desconhecido");
    });

    it.each([[["--job"]], [["--apagar-tudo"]], [["--job", "--job"]]])("invalid arguments %j → exit 1", async (argv) => {
      expect(await runMaintenanceCli(argv, process.env, io().io)).toBe(1);
    });

    it("parses --job <name> and --job=<name>", () => {
      expect(parseMaintenanceArgs(["--job", "audit-events"])).toEqual({ job: "audit-events" });
      expect(parseMaintenanceArgs(["--", "--job=rate-limit-counters"])).toEqual({ job: "rate-limit-counters" });
      expect(parseMaintenanceArgs([])).toEqual({ job: undefined });
    });

    it("runs a job and prints only counts → exit 0", async () => {
      const { out, err, io: sink } = io();
      expect(await runMaintenanceCli(["--job", "rate-limit-counters"], process.env, sink)).toBe(0);
      expect(err).toEqual([]);
      expect(out).toEqual(["rate-limit-counters: 0 removido(s)"]);
    });

    it("missing configuration → exit 1 listing only variable names", async () => {
      const { err, io: sink } = io();
      const env = { ...process.env, DATABASE_URL: undefined };
      expect(await runMaintenanceCli([], env, sink)).toBe(1);
      expect(err.join("\n")).toContain("DATABASE_URL");
    });
  });
});
