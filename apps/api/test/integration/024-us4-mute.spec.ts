import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ExamAlertSink } from "../../src/modules/attempt-integrity/exam-alert-sink";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { pushedTo, runAlertWorker, teacherPhone } from "../helpers/exam-alerts";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { examActivity, mobileApi } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 024/US4 (research Y8, contracts/http-api.md): "Silenciar avisos desta prova" is one row per teacher and exam,
 * for all of the teacher's phones; `PUT …/exam-alerts { muted }` is idempotent, from the app or the web; an alert
 * of a muted exam ends SKIPPED and is never sent late after the alerts are turned back on (024/FR-021); the room
 * and the exam change in nothing, and nothing is audited.
 */
describe("024/US4 professor desliga os avisos de uma prova", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let schoolClass: { id: string; teacherId: string };
  let student: TestUser;
  let examA: string;
  let examB: string;
  let attemptA: string;
  let attemptB: string;
  let ordinal: number;

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
    ordinal = 0;
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
    examA = (await examActivity(t, schoolClass, { title: "Prova A" })).activity.id;
    examB = (await examActivity(t, schoolClass, { title: "Prova B" })).activity.id;
    for (const activityId of [examA, examB]) {
      await t.prisma.activityAttendance.create({
        data: { activityId, studentUserId: student.id, classId: schoolClass.id, markedAt: new Date(), markedById: teacher.id },
      });
    }
    attemptA = (await createAttemptRow(t, examA, student.id)).attemptId;
    attemptB = (await createAttemptRow(t, examB, student.id)).attemptId;
  });

  const path = (activityId: string, classId = schoolClass.id) => `/api/classes/${classId}/activities/${activityId}/exam-alerts`;
  const mute = (token: string, activityId: string, muted: boolean) => mobileApi(t, token).put(path(activityId), { muted });

  /** One counted occurrence on each given exam, as the events batch writes it, at the clock's now. */
  const occur = async (...activityIds: string[]) => {
    ordinal += 1;
    const sink = t.get(ExamAlertSink);
    await t.prisma.runInTransaction((tx) =>
      sink.record(
        tx,
        activityIds.map((activityId) => ({
          kind: "OCCURRENCE" as const,
          activityId,
          attemptId: activityId === examA ? attemptA : attemptB,
          studentUserId: student.id,
          occurrenceOrdinal: ordinal,
          holdId: null,
          recordedAt: clock.now(),
        })),
      ),
    );
  };
  const alertsOf = async (activityId: string) =>
    (await t.prisma.examAlert.findMany({ where: { activityId }, orderBy: { occurrenceOrdinal: "asc" } })).map((alert) => alert.status);
  const pushedFor = (pushToken: string, activityId: string) =>
    pushedTo(t, pushToken).filter((message) => (message.data as { activityId?: string } | undefined)?.activityId === activityId);

  it("024/US4-1 silenciar A: as ocorrências de A terminam SKIPPED e as de B são enviadas", async () => {
    const phone = await teacherPhone(t, teacher);
    const res = await mute(phone.token, examA, true);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ muted: true });
    await occur(examA, examB);
    await runAlertWorker(t, clock.now());
    expect(await alertsOf(examA)).toEqual(["SKIPPED"]);
    expect(await alertsOf(examB)).toEqual(["SENT"]);
    expect(pushedFor(phone.pushToken, examA)).toHaveLength(0);
    expect(pushedFor(phone.pushToken, examB)).toHaveLength(1);
  });

  it("024/US4-2 024/FR-021 religar: a próxima de A é enviada e as anteriores continuam SKIPPED, sem aviso atrasado", async () => {
    const phone = await teacherPhone(t, teacher);
    await mute(phone.token, examA, true);
    await occur(examA);
    await runAlertWorker(t, clock.now());
    expect((await mute(phone.token, examA, false)).body).toEqual({ muted: false });
    clock.advance(1000);
    await runAlertWorker(t, clock.now());
    expect(pushedFor(phone.pushToken, examA)).toHaveLength(0);

    await occur(examA);
    await runAlertWorker(t, clock.now());
    expect(await alertsOf(examA)).toEqual(["SKIPPED", "SENT"]);
    expect(pushedFor(phone.pushToken, examA)).toHaveLength(1);
  });

  it("024/FR-021 um aviso pendente de uma prova silenciada antes do envio também não sai", async () => {
    const phone = await teacherPhone(t, teacher);
    await occur(examA);
    await mute(phone.token, examA, true);
    await runAlertWorker(t, clock.now());
    expect(await alertsOf(examA)).toEqual(["SKIPPED"]);
    expect(pushedTo(t, phone.pushToken)).toHaveLength(0);
  });

  it("024/US4-3 a lista mostra muted: true e o monitor da sala continua igual", async () => {
    const phone = await teacherPhone(t, teacher);
    const monitor = `/api/classes/${schoolClass.id}/activities/${examA}/exam-monitor`;
    const before = await mobileApi(t, phone.token).get(monitor);
    await mute(phone.token, examA, true);
    const list = await mobileApi(t, phone.token).get("/api/mobile/exams");
    expect(Object.fromEntries(list.body.items.map((item: { activityId: string; muted: boolean }) => [item.activityId, item.muted]))).toEqual({
      [examA]: true,
      [examB]: false,
    });
    const after = await mobileApi(t, phone.token).get(monitor);
    expect(after.status).toBe(200);
    expect(after.body).toEqual(before.body);
  });

  it("024/US4-4 silenciar num celular vale para os dois celulares do professor", async () => {
    const first = await teacherPhone(t, teacher);
    const second = await teacherPhone(t, teacher);
    await mute(first.token, examA, true);
    await occur(examA, examB);
    await runAlertWorker(t, clock.now());
    for (const phone of [first, second]) {
      expect(pushedFor(phone.pushToken, examA)).toHaveLength(0);
      expect(pushedFor(phone.pushToken, examB)).toHaveLength(1);
    }
  });

  it("024/US4-5 silenciar e religar duas vezes dá 200 com o mesmo estado, uma linha no máximo, sem auditoria", async () => {
    const phone = await teacherPhone(t, teacher);
    const audited = await t.prisma.auditEvent.count();
    for (const muted of [true, true]) {
      const res = await mute(phone.token, examA, muted);
      expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { muted } });
      expect(await t.prisma.examAlertMute.count()).toBe(1);
    }
    for (const muted of [false, false]) {
      const res = await mute(phone.token, examA, muted);
      expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { muted } });
      expect(await t.prisma.examAlertMute.count()).toBe(0);
    }
    expect(await t.prisma.auditEvent.count()).toBe(audited);
  });

  it("a mesma rota pela sessão da web silencia a prova", async () => {
    const web = api(t, { cookie: await loginAs(t, teacher) });
    const res = await web.put(path(examA), { muted: true });
    expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { muted: true } });
    expect(await t.prisma.examAlertMute.findMany({ select: { teacherUserId: true, activityId: true } })).toEqual([
      { teacherUserId: teacher.id, activityId: examA },
    ]);
  });

  it("404 para a turma de outro professor, uma atividade que não é prova e uma turma arquivada", async () => {
    const phone = await teacherPhone(t, teacher);
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherPhone = await teacherPhone(t, other);
    expect((await mute(otherPhone.token, examA, true)).status).toBe(404);

    const { activity: work } = await createActivity(t, schoolClass, { type: "ASSIGNMENT" });
    expect((await mute(phone.token, work.id, true)).status).toBe(404);

    const otherClass = await createClassWithStudents(t, teacher.id, { students: 0 });
    expect((await mobileApi(t, phone.token).put(path(examA, otherClass.schoolClass.id), { muted: true })).status).toBe(404);

    await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "ARCHIVED" } });
    expect((await mute(phone.token, examA, true)).status).toBe(404);
    expect(await t.prisma.examAlertMute.count()).toBe(0);
  });

  it("corpo com campo extra ou muted não booleano → 400", async () => {
    const phone = await teacherPhone(t, teacher);
    for (const body of [{ muted: true, teacherId: teacher.id }, { muted: "true" }, {}, { muted: null }]) {
      const res = await mobileApi(t, phone.token).put(path(examA), body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
    expect(await t.prisma.examAlertMute.count()).toBe(0);
  });
});
