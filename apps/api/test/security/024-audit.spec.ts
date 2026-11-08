import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { pushedTo, runAlertWorker, teacherPhone } from "../helpers/exam-alerts";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { LogCapture } from "../helpers/log-capture";
import { mobileApi, signInMobile } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MARKER = "MARCADOR-ALERTA-024";
const SECOND = 1000;

/**
 * 024/SC-005 (FR-016, FR-022, contracts/audit-events.md, contracts/push-notifications.md): with the student's
 * name, RA and e-mail, the exam's title and the statement all carrying `MARCADOR-ALERTA-024`, a whole cycle —
 * the app's sign-in, the device, occurrences up to the hold, the alerts, the mute and the sign-out — leaves the
 * marker and the push token out of `audit_events` and the captured logs. The notification carries only the
 * student's name and the exam's title and class: never the statement, an answer, a grade, an e-mail or an RA,
 * and never "fraude", "cola" or "violação".
 */
describe("024/SC-005 nenhum nome, título, texto ou token nos registros; o aviso só com o mínimo", () => {
  let t: TestApp;
  let clock: FixedClock;
  const logs = new LogCapture();
  let teacher: TestUser;
  let student: TestUser;
  let activityId: string;
  let statement: string;

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
    t.config.push.enabled = true;
    teacher = await createUser(t, { roles: ["TEACHER"], name: `Professora ${MARKER}` });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    student = created.students[0]!;
    await t.prisma.user.update({ where: { id: student.id }, data: { name: `Aluna ${MARKER}`, email: `aluna.${MARKER.toLowerCase()}@example.com` } });
    await t.prisma.studentProfile.update({ where: { userId: student.id }, data: { ra: `RA-${MARKER}`, displayName: `Aluna ${MARKER}` } });
    student = { ...student, name: `Aluna ${MARKER}`, email: `aluna.${MARKER.toLowerCase()}@example.com` };
    statement = `${MARKER} Enunciado secreto da questão`;
    const { activity } = await createActivity(t, created.schoolClass, {
      type: "EXAM",
      title: `Prova ${MARKER}`,
      publishAt: new Date(Date.now() - 60_000),
      durationMinutes: 60,
      startWindowMinutes: 15,
      questions: [{ type: "MULTIPLE_CHOICE", statement }],
    });
    activityId = activity.id;
    await t.prisma.activityAttendance.create({
      data: { activityId, studentUserId: student.id, classId: created.schoolClass.id, markedAt: new Date(), markedById: teacher.id },
    });
    await createAttemptRow(t, activityId, student.id);
  });

  it("024/SC-005 024/FR-016 o ciclo inteiro deixa o marcador e o token de push fora da auditoria e dos logs", async () => {
    // Through the app: the sign-in (audited), the device, the list and the mute on and off.
    const token = await signInMobile(t, teacher);
    const phone = await teacherPhone(t, teacher);
    expect((await mobileApi(t, token).get("/api/mobile/exams")).status).toBe(200);
    const mutePath = `/api/classes/${(await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activityId } })).classId}/activities/${activityId}/exam-alerts`;
    expect((await mobileApi(t, token).put(mutePath, { muted: true })).status).toBe(200);
    expect((await mobileApi(t, token).put(mutePath, { muted: false })).status).toBe(200);

    // The student's four occurrences: three warnings and the hold; one send fails and is retried.
    const studentClient = api(t, { cookie: await loginAs(t, student) });
    for (let i = 0; i < 4; i += 1) {
      const res = await recordEvents(studentClient, activityId, [integrityEvent("SCREEN_LEFT")]);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      clock.advance(3 * SECOND);
    }
    t.push.script("transient");
    await runAlertWorker(t, clock.now());
    clock.advance(2 * SECOND);
    await runAlertWorker(t, clock.now());
    expect(pushedTo(t, phone.pushToken)).toHaveLength(4);

    // The sign-out removes the device (audited `mobile_device.removed`).
    expect((await mobileApi(t, phone.token).delete("/api/auth/mobile/sessions/current")).status).toBe(204);

    const audit = JSON.stringify(await t.prisma.auditEvent.findMany(), (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
    expect(audit).toContain("exam_attempt.held");
    expect(audit).toContain("mobile_device.registered");
    expect(audit).toContain("mobile_device.removed");
    const text = logs.text();
    for (const secret of [MARKER, MARKER.toLowerCase(), phone.pushToken, token]) {
      expect(audit, `auditoria contém ${secret.slice(0, 12)}…`).not.toContain(secret);
      expect(text, `logs contêm ${secret.slice(0, 12)}…`).not.toContain(secret);
    }
  });

  it("024/SC-005 024/FR-022 o aviso traz só nome, prova e turma: nada de enunciado, e-mail, RA, nota ou rótulo de fraude", async () => {
    const phone = await teacherPhone(t, teacher);
    const studentClient = api(t, { cookie: await loginAs(t, student) });
    for (let i = 0; i < 4; i += 1) {
      await recordEvents(studentClient, activityId, [integrityEvent("SCREEN_LEFT")]);
      clock.advance(3 * SECOND);
    }
    await runAlertWorker(t, clock.now());
    const messages = pushedTo(t, phone.pushToken);
    expect(messages).toHaveLength(4);
    for (const message of messages) {
      const wire = JSON.stringify(message);
      expect(message.body).toContain(`Aluna ${MARKER}`);
      expect(message.body).toContain(`Prova ${MARKER}`);
      for (const forbidden of [statement, "Enunciado", student.email, `RA-${MARKER}`, "nota", "@"]) expect(wire).not.toContain(forbidden);
      expect(wire).not.toMatch(/\b(fraude|cola|viola[çc][ãa]o)\b/i);
      expect(Object.keys(message.data).sort()).toEqual(["activityId", "classId", "kind", "studentUserId"]);
    }
  });
});
