import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ExamAlertSink } from "../../src/modules/attempt-integrity/exam-alert-sink";
import { AuditService } from "../../src/modules/audit/audit.service";
import { ExamAlertWorker } from "../../src/modules/exam-alerts/exam-alert.worker";
import { AlertRecipients } from "../../src/modules/exam-alerts/recipients";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { pushedTo, teacherPhone } from "../helpers/exam-alerts";
import { createUser, type TestUser } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const SECOND = 1000;

/**
 * 024 research Y5, Y6 (contracts/push-notifications.md "Dispatch"): the worker claims with `FOR UPDATE SKIP
 * LOCKED` under a lease, never sends an alert twice to a device or later than 60 s, retries a transient failure
 * after 2 s and 5 s, removes a device Expo no longer knows (ticket or receipt) and logs no token or name.
 */
describe("024 o worker dos avisos", () => {
  let t: TestApp;
  let clock: FixedClock;
  const logs = new LogCapture();
  let teacher: TestUser;
  let students: TestUser[];
  let activityId: string;
  let attemptIds: string[];

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock, logs });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    t.push.reset();
    logs.clear();
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 3 });
    students = created.students.map((student, index) => ({ ...student, name: `MARCADOR-ALERTA-024 ${index}` }));
    for (const student of students) await t.prisma.user.update({ where: { id: student.id }, data: { name: student.name } });
    const { activity } = await createActivity(t, created.schoolClass, { type: "EXAM", publishAt: new Date(Date.now() - 60_000), durationMinutes: 60, startWindowMinutes: 15 });
    activityId = activity.id;
    attemptIds = [];
    for (const student of students) {
      await t.prisma.activityAttendance.create({ data: { activityId, studentUserId: student.id, classId: created.schoolClass.id, markedAt: new Date(), markedById: teacher.id } });
      attemptIds.push((await createAttemptRow(t, activityId, student.id)).attemptId);
    }
  });

  /** `count` alerts written as the events batch writes them, at the clock's now. */
  const writeAlerts = async (count: number, ordinal = 1) => {
    const sink = t.get(ExamAlertSink);
    await t.prisma.runInTransaction((tx) =>
      sink.record(
        tx,
        attemptIds.slice(0, count).map((attemptId, index) => ({
          kind: "OCCURRENCE" as const,
          activityId,
          attemptId,
          studentUserId: students[index]!.id,
          occurrenceOrdinal: ordinal,
          holdId: null,
          recordedAt: clock.now(),
        })),
      ),
    );
  };
  const worker = () => t.get(ExamAlertWorker);
  const statuses = async () => (await t.prisma.examAlert.findMany({ orderBy: { createdAt: "asc" } })).map((alert) => alert.status);

  it("024/SC-001 dois workers ao mesmo tempo nunca enviam o mesmo aviso ao mesmo celular (SKIP LOCKED, PK da entrega)", async () => {
    const first = await teacherPhone(t, teacher);
    const second = await teacherPhone(t, teacher);
    await writeAlerts(3);
    const other = new ExamAlertWorker(t.prisma, t.push, t.get(AlertRecipients), t.get(AuditService), t.config, clock);
    await Promise.all([worker().runOnce(clock.now()), other.runOnce(clock.now())]);
    expect(pushedTo(t, first.pushToken)).toHaveLength(3);
    expect(pushedTo(t, second.pushToken)).toHaveLength(3);
    expect(await t.prisma.examAlertDelivery.count()).toBe(6);
    expect(await statuses()).toEqual(["SENT", "SENT", "SENT"]);
  });

  it("um aviso reclamado por um worker que morreu volta a ser enviado quando a reserva vence", async () => {
    const phone = await teacherPhone(t, teacher);
    await writeAlerts(1);
    await t.prisma.examAlert.updateMany({ data: { claimedUntil: new Date(clock.now().getTime() + 30 * SECOND) } });
    await worker().runOnce(clock.now());
    expect(pushedTo(t, phone.pushToken)).toHaveLength(0);
    clock.advance(31 * SECOND);
    await worker().runOnce(clock.now());
    expect(pushedTo(t, phone.pushToken)).toHaveLength(1);
  });

  it("024/FR-019 um aviso com mais de 60 s nunca é enviado: EXPIRED", async () => {
    const phone = await teacherPhone(t, teacher);
    await writeAlerts(1);
    clock.advance(61 * SECOND);
    await worker().runOnce(clock.now());
    expect(pushedTo(t, phone.pushToken)).toHaveLength(0);
    expect(await statuses()).toEqual(["EXPIRED"]);
  });

  it("falha transitória: tenta de novo em 2 s e em 5 s, e na terceira falha termina EXPIRED", async () => {
    const phone = await teacherPhone(t, teacher);
    await writeAlerts(1);
    t.push.failing = "transient";
    await worker().runOnce(clock.now());
    let [alert] = await t.prisma.examAlert.findMany();
    expect(alert).toMatchObject({ status: "PENDING", tries: 1 });
    expect(alert!.claimedUntil!.getTime()).toBe(clock.now().getTime() + 2 * SECOND);
    expect(await t.prisma.examAlertDelivery.count()).toBe(0);

    clock.advance(1 * SECOND);
    await worker().runOnce(clock.now());
    expect((await t.prisma.examAlert.findFirstOrThrow()).tries).toBe(1);

    clock.advance(1 * SECOND);
    await worker().runOnce(clock.now());
    [alert] = await t.prisma.examAlert.findMany();
    expect(alert).toMatchObject({ status: "PENDING", tries: 2 });
    expect(alert!.claimedUntil!.getTime()).toBe(clock.now().getTime() + 5 * SECOND);

    clock.advance(5 * SECOND);
    await worker().runOnce(clock.now());
    expect(await t.prisma.examAlert.findFirstOrThrow()).toMatchObject({ status: "EXPIRED", tries: 3 });
    expect(pushedTo(t, phone.pushToken)).toHaveLength(0);
  });

  it("depois de uma falha transitória o próximo envio passa, uma vez só", async () => {
    const phone = await teacherPhone(t, teacher);
    await writeAlerts(1);
    t.push.script("transient");
    await worker().runOnce(clock.now());
    clock.advance(2 * SECOND);
    await worker().runOnce(clock.now());
    expect(pushedTo(t, phone.pushToken)).toHaveLength(1);
    expect(await statuses()).toEqual(["SENT"]);
    expect(await t.prisma.examAlertDelivery.count()).toBe(1);
  });

  it("um ticket DeviceNotRegistered remove o celular, auditado pelo sistema", async () => {
    const phone = await teacherPhone(t, teacher);
    await writeAlerts(1);
    t.push.script({ ok: false, errorCode: "DeviceNotRegistered" });
    await worker().runOnce(clock.now());
    expect(await t.prisma.mobileDevice.count()).toBe(0);
    expect(await t.prisma.examAlertDelivery.findFirstOrThrow()).toMatchObject({ status: "TICKET_ERROR", errorCode: "DeviceNotRegistered" });
    expect(await statuses()).toEqual(["SKIPPED"]);
    const [removed] = await t.prisma.auditEvent.findMany({ where: { type: "mobile_device.removed" } });
    expect(removed).toMatchObject({ actorType: "SYSTEM", targetId: phone.deviceId, metadata: { reason: "PROVIDER_UNREGISTERED" } });
  });

  it("os recibos de 15 min a 24 h são lidos; um recibo DeviceNotRegistered remove o celular", async () => {
    const phone = await teacherPhone(t, teacher);
    await writeAlerts(2);
    await worker().runOnce(clock.now());
    const [first, second] = await t.prisma.examAlertDelivery.findMany({ orderBy: { ticketId: "asc" } });
    t.push.receipt(first!.ticketId!, { ok: true });
    t.push.receipt(second!.ticketId!, { ok: false, errorCode: "DeviceNotRegistered" });

    clock.advance(10 * 60 * SECOND);
    await worker().checkReceipts(clock.now());
    expect(t.push.receiptQueries).toEqual([]);

    clock.advance(6 * 60 * SECOND);
    await worker().checkReceipts(clock.now());
    expect(t.push.receiptQueries).toHaveLength(1);
    const byTicket = new Map((await t.prisma.examAlertDelivery.findMany()).map((row) => [row.ticketId, row]));
    expect(byTicket.get(first!.ticketId)).toMatchObject({ status: "RECEIPT_OK" });
    expect(byTicket.get(second!.ticketId)).toMatchObject({ status: "RECEIPT_ERROR", errorCode: "DeviceNotRegistered" });
    expect(await t.prisma.mobileDevice.count({ where: { id: phone.deviceId } })).toBe(0);
  });

  it("024/FR-016 nenhum token, nome ou título nos logs do worker, nem quando o envio falha", async () => {
    const phone = await teacherPhone(t, teacher);
    await writeAlerts(3);
    t.push.failing = "throw";
    await worker().runOnce(clock.now());
    t.push.failing = null;
    clock.advance(2 * SECOND);
    await worker().runOnce(clock.now());
    const text = logs.text();
    expect(text).toContain("exam_alert.send_failed");
    expect(text).not.toContain(phone.pushToken);
    expect(text).not.toContain("MARCADOR-ALERTA-024");
    expect(text).not.toContain("teste-024-TOKEN-EXPO-FALSO");
  });
});
