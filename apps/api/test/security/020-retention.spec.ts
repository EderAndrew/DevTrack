import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentFeedbackStatus } from "../../src/generated/prisma/client";
import { FEEDBACK_RETENTION_MONTHS, FeedbackRetentionJob } from "../../src/modules/student-feedback/feedback-retention.job";
import { PrismaService } from "../../src/platform/database/prisma.service";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { DAY, FixedClock } from "../helpers/clock";
import { createUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MARKER = "MARCADOR-FEEDBACK-020";

/**
 * 020/FR-015 (research J8, contracts/maintenance-jobs.md): the maintenance job `student-feedback`
 * deletes, with their history, the `RESOLVED` and `ARCHIVED` feedbacks whose last status change is
 * older than 24 months; `RECEIVED` and `IN_REVIEW` feedbacks are never deleted, however old. The run
 * writes no audit event and logs only the job name and the count.
 */
describe("020/FR-015 retenção dos feedbacks encerrados (job student-feedback)", () => {
  let t: TestApp;
  let clock: FixedClock;
  let studentId: string;
  let adminId: string;

  const NOW = new Date("2028-10-25T12:00:00.000Z");
  /** 24 calendar months before `NOW`. */
  const limit = () => {
    const at = new Date(NOW);
    at.setUTCMonth(at.getUTCMonth() - FEEDBACK_RETENTION_MONTHS);
    return at;
  };
  const purge = (now = NOW) => t.get(MaintenanceService).run({ job: "student-feedback", now });

  /** A feedback inserted at `status`, last changed at `changedAt`, with one history row when it left RECEIVED. */
  const feedback = async (status: StudentFeedbackStatus, changedAt: Date, createdAt = new Date(changedAt.getTime() - DAY)) => {
    const row = await t.prisma.studentFeedback.create({
      data: {
        studentId,
        submissionId: randomUUID(),
        category: "PROBLEM",
        message: `${MARKER} a página travou ao salvar.`,
        originPath: `/painel/${MARKER}`,
        status,
        createdAt,
        statusChangedAt: changedAt,
      },
    });
    if (status !== "RECEIVED") {
      await t.prisma.studentFeedbackStatusChange.create({
        data: { feedbackId: row.id, fromStatus: "RECEIVED", toStatus: status, changedById: adminId, changedAt },
      });
    }
    return row.id;
  };
  const ids = async () => (await t.prisma.studentFeedback.findMany({ select: { id: true } })).map((row) => row.id).sort();

  beforeAll(async () => {
    clock = new FixedClock(NOW);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    studentId = (await createUser(t, { roles: ["STUDENT"] })).id;
    adminId = (await createUser(t, { roles: ["ADMIN"] })).id;
  });

  it("020/FR-015 RESOLVED/ARCHIVED de 24 meses + 1 dia saem com o histórico; de 24 meses − 1 dia ficam", async () => {
    const older = new Date(limit().getTime() - DAY);
    const newer = new Date(limit().getTime() + DAY);
    const oldResolved = await feedback("RESOLVED", older);
    const oldArchived = await feedback("ARCHIVED", older);
    const recentResolved = await feedback("RESOLVED", newer);
    const recentArchived = await feedback("ARCHIVED", newer);

    expect(await purge()).toEqual({ status: "completed", results: [{ job: "student-feedback", removed: 2 }] });

    expect(await ids()).toEqual([recentResolved, recentArchived].sort());
    const history = await t.prisma.studentFeedbackStatusChange.findMany({ select: { feedbackId: true } });
    expect(history.map((row) => row.feedbackId).sort()).toEqual([recentResolved, recentArchived].sort());
    expect(await t.prisma.studentFeedback.count({ where: { id: { in: [oldResolved, oldArchived] } } })).toBe(0);

    // Running it again changes nothing.
    expect(await purge()).toEqual({ status: "completed", results: [{ job: "student-feedback", removed: 0 }] });
  });

  it("020/FR-015 RECEIVED e IN_REVIEW antigos nunca são apagados", async () => {
    const ancient = new Date(limit().getTime() - 10 * 365 * DAY);
    const received = await feedback("RECEIVED", ancient);
    const inReview = await feedback("IN_REVIEW", ancient);

    expect(await purge()).toEqual({ status: "completed", results: [{ job: "student-feedback", removed: 0 }] });
    expect(await ids()).toEqual([received, inReview].sort());
  });

  it("020/FR-015 a idade é a última mudança de situação, não a criação", async () => {
    // Created four years ago, resolved a month ago: it stays.
    const id = await feedback("RESOLVED", new Date(NOW.getTime() - 30 * DAY), new Date(NOW.getTime() - 4 * 365 * DAY));
    expect(await purge()).toMatchObject({ results: [{ job: "student-feedback", removed: 0 }] });
    expect(await ids()).toEqual([id]);
  });

  it("020/FR-015 apaga em lotes de 1 000, cada lote numa transação, sem auditoria e só com a contagem no log", async () => {
    const older = new Date(limit().getTime() - DAY);
    await t.prisma.$executeRaw`
      INSERT INTO student_feedbacks (student_id, submission_id, category, message, origin_path, status, created_at, status_changed_at)
      SELECT ${studentId}::uuid, gen_random_uuid(), 'PROBLEM', ${`${MARKER} mensagem em lote`}, '/painel', 'ARCHIVED',
             ${older}::timestamptz, ${older}::timestamptz
      FROM generate_series(1, 1001)`;
    const auditBefore = await t.prisma.auditEvent.count();

    const prisma = t.get(PrismaService);
    const transactions = vi.spyOn(prisma, "runInTransaction");
    const logs = vi.spyOn(Logger.prototype, "log");
    try {
      expect(await purge()).toEqual({ status: "completed", results: [{ job: "student-feedback", removed: 1001 }] });
      // 1 000 + 1, the last batch smaller than the limit.
      expect(transactions).toHaveBeenCalledTimes(2);
      const logged = JSON.stringify(logs.mock.calls);
      expect(logged).toContain("student-feedback: 1001 removed");
      expect(logged).not.toContain(MARKER);
    } finally {
      transactions.mockRestore();
      logs.mockRestore();
    }
    expect(await t.prisma.studentFeedback.count()).toBe(0);
    expect(await t.prisma.auditEvent.count()).toBe(auditBefore);
  });

  it("020/FR-015 fora do job o apagamento continua recusado", async () => {
    const id = await feedback("RESOLVED", new Date(limit().getTime() - DAY));
    await expect(t.prisma.$executeRaw`DELETE FROM student_feedbacks WHERE id = ${id}::uuid`).rejects.toThrow();
    await expect(t.prisma.$executeRaw`DELETE FROM student_feedback_status_changes WHERE feedback_id = ${id}::uuid`).rejects.toThrow();
    expect(await ids()).toEqual([id]);
    expect(t.get(FeedbackRetentionJob).name).toBe("student-feedback");
    expect(t.get(MaintenanceService).registeredJobs()).toContain("student-feedback");
  });
});
