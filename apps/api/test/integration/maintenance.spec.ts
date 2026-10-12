import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseMaintenanceArgs, runMaintenanceCli } from "../../src/cli/maintenance.command";
import { LockKey } from "../../src/platform/database/transaction";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { createClass, createClassInvitation, createUser, uniqueEmail } from "../helpers/factories";
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

  describe("017 mail-records job (research N13, 017 contracts/maintenance-jobs.md)", () => {
    const DAY_MS = 86_400_000;
    // The reference instant of the run (a fixed clock), not the machine's.
    const now = new Date("2027-03-01T12:00:00.000Z");
    const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

    const finalColumns = {
      SENT: { sentAt: now },
      DELIVERED: { sentAt: now, deliveredAt: now },
      UNDELIVERED: { undeliveredAt: now, undeliveredReason: "BOUNCED" },
      FAILED: {},
      DISCARDED: { discardReason: "EXPIRED" },
      SUPERSEDED: {},
    } as const;

    let teacherId: string;
    let classId: string;

    beforeEach(async () => {
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      teacherId = teacher.id;
      classId = (await createClass(t, teacher.id)).id;
    });

    const classInvitation = async (status: "PENDING" | "ACCEPTED" | "CANCELLED" = "PENDING") => {
      const { invitation } = await createClassInvitation(t, classId, uniqueEmail("aluno-n13"));
      if (status !== "PENDING") {
        await t.prisma.classInvitation.update({
          where: { id: invitation.id },
          data: status === "ACCEPTED" ? { status, acceptedAt: now } : { status, cancelledAt: now, cancelReason: "TEACHER" },
        });
      }
      return invitation.id;
    };

    const delivery = (
      subject: { classInvitationId: string } | { userId: string },
      status: keyof typeof finalColumns | "PENDING",
      at: Date,
    ) =>
      t.prisma.mailDelivery.create({
        data: {
          ...("classInvitationId" in subject ? { kind: "CLASS_INVITATION" as const } : { kind: "VERIFY_EMAIL" as const }),
          ...subject,
          status,
          ...(status === "PENDING" ? { nextAttemptAt: at } : finalColumns[status]),
          createdAt: at,
          updatedAt: at,
        },
      });

    let noticeSeq = 0;
    const notice = (deliveryId: string | null, receivedAt: Date) =>
      t.prisma.mailNotice.create({
        data: {
          provider: "RESEND",
          noticeId: `msg_n13_${++noticeSeq}`,
          kind: "DELIVERED",
          deliveryId,
          attempt: 1,
          occurredAt: receivedAt,
          receivedAt,
        },
      });

    it("removes notices older than 90 days and nothing newer", async () => {
      const kept = await delivery({ userId: teacherId }, "DELIVERED", daysAgo(10));
      await notice(kept.id, daysAgo(91));
      await notice(kept.id, daysAgo(120));
      const recent = await notice(kept.id, daysAgo(89));

      expect(await maintenance.run({ job: "mail-records", now })).toEqual({
        status: "completed",
        results: [{ job: "mail-records", removed: 2 }],
      });
      expect((await t.prisma.mailNotice.findMany()).map((n) => n.id)).toEqual([recent.id]);
      expect(await t.prisma.mailDelivery.count()).toBe(1);
    });

    it("removes final deliveries older than MAIL_RECORDS_RETENTION_DAYS, never PENDING, SENT or newer ones", async () => {
      const userId = teacherId;
      const old = daysAgo(t.config.mail.recordsRetentionDays + 1);
      const gone = await Promise.all(
        (["DELIVERED", "UNDELIVERED", "FAILED", "DISCARDED", "SUPERSEDED"] as const).map((s) => delivery({ userId }, s, old)),
      );
      const recentFinal = await delivery({ userId }, "DELIVERED", daysAgo(t.config.mail.recordsRetentionDays - 1));
      const oldPending = await delivery({ userId }, "PENDING", old);
      // SENT is not final: a provider notice may still move it (research N7).
      const oldSent = await delivery({ userId }, "SENT", old);

      const result = await maintenance.run({ job: "mail-records", now });

      expect(result).toEqual({ status: "completed", results: [{ job: "mail-records", removed: gone.length }] });
      expect((await t.prisma.mailDelivery.findMany({ orderBy: { id: "asc" } })).map((d) => d.id).sort()).toEqual(
        [recentFinal.id, oldPending.id, oldSent.id].sort(),
      );
    });

    it("keeps the latest delivery of a PENDING invitation, removes its older ones and those of a closed invitation", async () => {
      const old = (extra: number) => daysAgo(t.config.mail.recordsRetentionDays + extra);
      const pending = await classInvitation("PENDING");
      const superseded = await delivery({ classInvitationId: pending }, "SUPERSEDED", old(30));
      const latest = await delivery({ classInvitationId: pending }, "UNDELIVERED", old(10));
      const accepted = await classInvitation("ACCEPTED");
      await delivery({ classInvitationId: accepted }, "DELIVERED", old(10));

      const result = await maintenance.run({ job: "mail-records", now });

      expect(result).toEqual({ status: "completed", results: [{ job: "mail-records", removed: 2 }] });
      expect((await t.prisma.mailDelivery.findMany()).map((d) => d.id)).toEqual([latest.id]);
      expect(await t.prisma.mailDelivery.findUnique({ where: { id: superseded.id } })).toBeNull();
    });

    it("keeps the latest delivery of a PENDING teacher invitation too", async () => {
      const admin = await createUser(t, { roles: ["ADMIN"] });
      const role = await t.prisma.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
      const invitation = await t.prisma.invitation.create({
        data: {
          email: uniqueEmail("prof-n13"),
          displayName: "Professora",
          roleId: role.id,
          invitedById: admin.id,
          tokenHash: randomUUID(),
          status: "PENDING",
          expiresAt: new Date(now.getTime() + DAY_MS),
          lastSentAt: now,
        },
      });
      const old = daysAgo(t.config.mail.recordsRetentionDays + 5);
      const latest = await t.prisma.mailDelivery.create({
        data: { kind: "INVITATION_TEACHER", invitationId: invitation.id, status: "FAILED", createdAt: old, updatedAt: old },
      });

      expect((await maintenance.run({ job: "mail-records", now })).status).toBe("completed");
      expect((await t.prisma.mailDelivery.findMany()).map((d) => d.id)).toEqual([latest.id]);
    });

    it("a removed delivery leaves its recent notices with delivery_id null", async () => {
      const old = await delivery({ userId: teacherId }, "DELIVERED", daysAgo(t.config.mail.recordsRetentionDays + 1));
      const recent = await notice(old.id, daysAgo(5));

      await maintenance.run({ job: "mail-records", now });

      expect(await t.prisma.mailDelivery.count()).toBe(0);
      expect(await t.prisma.mailNotice.findUniqueOrThrow({ where: { id: recent.id } })).toMatchObject({
        deliveryId: null,
        kind: "DELIVERED",
      });
    });

    it("works in batches of 1000 and the purge switch never leaks out of its transaction", async () => {
      const old = daysAgo(91);
      await t.prisma.$executeRaw`
        INSERT INTO mail_notices (provider, notice_id, kind, occurred_at, received_at)
        SELECT 'RESEND', 'msg_batch_' || g, 'DELIVERED', ${old}::timestamptz, ${old}::timestamptz
        FROM generate_series(1, 2500) g`;

      expect(await maintenance.run({ job: "mail-records", now })).toEqual({
        status: "completed",
        results: [{ job: "mail-records", removed: 2_500 }],
      });

      const remaining = await notice(null, daysAgo(1));
      await expect(t.prisma.mailNotice.delete({ where: { id: remaining.id } })).rejects.toThrow(/append-only/);
    });

    it("writes no audit event (a purge of technical records)", async () => {
      await notice(null, daysAgo(100));
      await maintenance.run({ job: "mail-records", now });
      expect(await t.prisma.auditEvent.count()).toBe(0);
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
