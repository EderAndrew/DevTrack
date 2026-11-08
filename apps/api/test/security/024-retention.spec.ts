import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_LIFETIMES } from "../../src/modules/auth/session.service";
import { EXAM_ALERT_RETENTION_DAYS } from "../../src/modules/exam-alerts/exam-alerts.job";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { teacherPhone } from "../helpers/exam-alerts";
import { createUser, type TestUser } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { examActivity } from "../helpers/mobile";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 024 research Y9, Y12 (contracts/configuration.md "Maintenance jobs"): `exam-alerts` deletes the alerts older
 * than 7 days with their deliveries, and nothing newer; a DELETE outside the job keeps failing. `mobile-devices`
 * deletes only the devices whose MOBILE session expired (absolute end or idle), never one of a valid session.
 * Neither writes an audit event; the run logs only the job name and the count.
 */
describe("024 retenção dos avisos e dos celulares (jobs exam-alerts e mobile-devices)", () => {
  let t: TestApp;
  let clock: FixedClock;
  const logs = new LogCapture();
  let teacher: TestUser;
  let activityId: string;
  let attemptId: string;
  let studentId: string;
  let ordinal: number;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock, logs });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
    clock.set(new Date());
    ordinal = 0;
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    studentId = created.students[0]!.id;
    activityId = (await examActivity(t, created.schoolClass)).activity.id;
    await t.prisma.activityAttendance.create({ data: { activityId, studentUserId: studentId, classId: created.schoolClass.id, markedAt: new Date(), markedById: teacher.id } });
    attemptId = (await createAttemptRow(t, activityId, studentId)).attemptId;
  });

  const run = (job: "exam-alerts" | "mobile-devices", now = clock.now()) => t.get(MaintenanceService).run({ job, now });

  /** A sent alert created at `createdAt`, with one delivery. */
  const alertAt = async (createdAt: Date) => {
    ordinal += 1;
    const alert = await t.prisma.examAlert.create({
      data: { kind: "OCCURRENCE", activityId, attemptId, studentUserId: studentId, occurrenceOrdinal: ordinal, status: "SENT", tries: 1, createdAt, processedAt: createdAt },
    });
    await t.prisma.examAlertDelivery.create({ data: { alertId: alert.id, deviceId: randomUUID(), status: "TICKET_OK", ticketId: randomUUID(), sentAt: createdAt } });
    return alert.id;
  };

  it("exam-alerts apaga os avisos com mais de 7 dias e as entregas deles, e nada mais novo", async () => {
    const limit = new Date(clock.now().getTime() - EXAM_ALERT_RETENTION_DAYS * DAY);
    const old = await alertAt(new Date(limit.getTime() - 1000));
    const atLimit = await alertAt(limit);
    const recent = await alertAt(new Date(clock.now().getTime() - DAY));
    const audited = await t.prisma.auditEvent.count();

    const result = await run("exam-alerts");
    expect(result).toEqual({ status: "completed", results: [{ job: "exam-alerts", removed: 1 }] });
    expect((await t.prisma.examAlert.findMany({ select: { id: true } })).map((row) => row.id).sort()).toEqual([atLimit, recent].sort());
    expect(await t.prisma.examAlertDelivery.count({ where: { alertId: old } })).toBe(0);
    expect(await t.prisma.examAlertDelivery.count()).toBe(2);
    expect(await t.prisma.auditEvent.count()).toBe(audited);
    expect(logs.text()).toContain("exam-alerts: 1 removed");
  });

  it("exam-alerts apaga todos os avisos vencidos numa rodada", async () => {
    const old = new Date(clock.now().getTime() - 8 * DAY);
    for (let i = 0; i < 3; i += 1) await alertAt(old);
    const transactions = await run("exam-alerts");
    expect(transactions).toEqual({ status: "completed", results: [{ job: "exam-alerts", removed: 3 }] });
    expect(await t.prisma.examAlert.count()).toBe(0);
  });

  it("um DELETE de aviso fora do job continua recusado", async () => {
    await alertAt(new Date(clock.now().getTime() - 8 * DAY));
    await expect(t.prisma.examAlert.deleteMany()).rejects.toThrow(/only the exam-alerts retention job deletes/);
    expect(await t.prisma.examAlert.count()).toBe(1);
  });

  it("mobile-devices apaga só os celulares de sessões vencidas (fim absoluto ou ociosa), nunca de uma sessão válida", async () => {
    const valid = await teacherPhone(t, teacher);
    const idle = await teacherPhone(t, teacher);
    const ended = await teacherPhone(t, teacher);
    const now = clock.now();
    await t.prisma.session.update({ where: { id: idle.sessionId }, data: { lastUsedAt: new Date(now.getTime() - SESSION_LIFETIMES.MOBILE.idleMs - 1000) } });
    await t.prisma.session.update({ where: { id: ended.sessionId }, data: { absoluteExpiresAt: new Date(now.getTime() - 1000) } });
    const audited = await t.prisma.auditEvent.count();

    const result = await run("mobile-devices", now);
    expect(result).toEqual({ status: "completed", results: [{ job: "mobile-devices", removed: 2 }] });
    expect((await t.prisma.mobileDevice.findMany({ select: { id: true } })).map((row) => row.id)).toEqual([valid.deviceId]);
    expect(await t.prisma.auditEvent.count()).toBe(audited);
    expect(logs.text()).toContain("mobile-devices: 2 removed");
    expect(logs.text()).not.toContain(valid.pushToken);
    expect(logs.text()).not.toContain(idle.pushToken);
  });

  it("um celular de sessão válida que passa do limite de ociosidade sai na rodada seguinte", async () => {
    const phone = await teacherPhone(t, teacher);
    expect((await run("mobile-devices")).status).toBe("completed");
    expect(await t.prisma.mobileDevice.count()).toBe(1);
    const later = new Date(clock.now().getTime() + SESSION_LIFETIMES.MOBILE.idleMs + 1000);
    await run("mobile-devices", later);
    expect(await t.prisma.mobileDevice.count({ where: { id: phone.deviceId } })).toBe(0);
  });
});
