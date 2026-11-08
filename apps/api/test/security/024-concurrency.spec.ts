import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ExamAlertWorker } from "../../src/modules/exam-alerts/exam-alert.worker";
import { AlertRecipients } from "../../src/modules/exam-alerts/recipients";
import { AuditService } from "../../src/modules/audit/audit.service";
import { createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { pushedTo, teacherPhone } from "../helpers/exam-alerts";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { examActivity, expoToken, openMobileSession, registerDevice } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 024 (research Y5, Y9; data-model "exam_alerts", "mobile_devices"): two simultaneous batches with the 4th
 * occurrence open one hold and write one HOLD alert, sent once per phone; two sessions registering the same push
 * token end with one owner; two workers on the same queue never deliver an alert twice to a phone.
 */
describe("024 concorrência dos avisos e dos celulares", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let students: TestUser[];
  let classId: string;
  let activityId: string;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    t.push.reset();
    clock.set(new Date());
    t.config.push.enabled = true;
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 5 });
    classId = created.schoolClass.id;
    students = created.students;
    activityId = (await examActivity(t, created.schoolClass)).activity.id;
    for (const student of students) {
      await t.prisma.activityAttendance.create({ data: { activityId, studentUserId: student.id, classId, markedAt: new Date(), markedById: teacher.id } });
      await createAttemptRow(t, activityId, student.id);
    }
  });

  const newWorker = () => new ExamAlertWorker(t.prisma, t.push, t.get(AlertRecipients), t.get(AuditService), t.config, clock);

  it("dois lotes simultâneos com a 4ª ocorrência: uma retenção, um aviso HOLD e um envio por celular", async () => {
    const phones = [await teacherPhone(t, teacher), await teacherPhone(t, teacher)];
    const client = api(t, { cookie: await loginAs(t, students[0]!) });
    for (let i = 0; i < 3; i += 1) {
      expect((await recordEvents(client, activityId, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
      clock.advance(3000);
    }
    const results = await Promise.all([
      recordEvents(client, activityId, [integrityEvent("SCREEN_LEFT")]),
      recordEvents(client, activityId, [integrityEvent("FULLSCREEN_EXITED")]),
    ]);
    expect(results.map((res) => res.status)).toEqual([200, 200]);
    expect(await t.prisma.examAttemptHold.count()).toBe(1);
    expect(await t.prisma.examAlert.count({ where: { kind: "HOLD" } })).toBe(1);
    await Promise.all([newWorker().runOnce(clock.now()), newWorker().runOnce(clock.now())]);
    for (const phone of phones) expect(pushedTo(t, phone.pushToken).filter((message) => message.data.kind === "HOLD")).toHaveLength(1);
  });

  it("dois PUT /mobile/device com o mesmo token em sessões diferentes terminam com um único dono", async () => {
    const pushToken = expoToken();
    const sessions = [await openMobileSession(t, teacher), await openMobileSession(t, await createUser(t, { roles: ["TEACHER"] }))];
    const results = await Promise.all(sessions.map((session) => registerDevice(t, session.token, pushToken)));
    expect(results.map((res) => res.status)).toEqual([200, 200]);
    const owners = await t.prisma.mobileDevice.findMany({ where: { pushToken } });
    expect(owners).toHaveLength(1);
    expect(sessions.map((session) => session.sessionId)).toContain(owners[0]!.sessionId);
  });

  it("024/SC-001 três workers sobre 40 avisos nunca entregam um aviso duas vezes ao mesmo celular", async () => {
    const phones = [await teacherPhone(t, teacher), await teacherPhone(t, teacher)];
    for (let round = 0; round < 8; round += 1) {
      await Promise.all(
        students.map(async (student) => {
          const res = await recordEvents(api(t, { cookie: await loginAs(t, student) }), activityId, [integrityEvent("SCREEN_LEFT")]);
          expect(res.status).toBe(200);
        }),
      );
      clock.advance(3000);
    }
    // Five students × 8 occurrences: 3 warnings, the hold and 4 uncounted after it → 4 alerts each.
    const total = await t.prisma.examAlert.count();
    expect(total).toBe(students.length * 4);
    await Promise.all([newWorker().runOnce(clock.now()), newWorker().runOnce(clock.now()), newWorker().runOnce(clock.now())]);
    expect(await t.prisma.examAlertDelivery.count()).toBe(total * phones.length);
    for (const phone of phones) {
      const sent = pushedTo(t, phone.pushToken);
      expect(sent).toHaveLength(total);
      expect(new Set(sent.map((message) => `${message.data.studentUserId}:${message.body}`)).size).toBe(total);
    }
  });
});
