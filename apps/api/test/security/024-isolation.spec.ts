import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { pushedTo, runAlertWorker, teacherPhone } from "../helpers/exam-alerts";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { examActivity, mobileApi } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 024/SC-004 (contracts/http-api.md "Permission matrix", research Y4, Y5): teacher B reads nothing of teacher A's
 * exams through the app — the list, the room, a student's occurrences and the mute are 404 or absent — and a
 * student, a manager and an ADMIN are 403 on all of them; no alert of A's class reaches B's phone, nor A's phone
 * after "Sair" or a revocation.
 */
describe("024/SC-004 só o professor da turma vê a sala e recebe os avisos", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacherA: TestUser;
  let teacherB: TestUser;
  let student: TestUser;
  let classId: string;
  let activityId: string;
  let attemptId: string;

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
    teacherA = await createUser(t, { roles: ["TEACHER"] });
    teacherB = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacherA.id, { students: 1 });
    classId = created.schoolClass.id;
    student = created.students[0]!;
    activityId = (await examActivity(t, created.schoolClass)).activity.id;
    await t.prisma.activityAttendance.create({ data: { activityId, studentUserId: student.id, classId, markedAt: new Date(), markedById: teacherA.id } });
    attemptId = (await createAttemptRow(t, activityId, student.id)).attemptId;
  });

  const paths = () => ({
    monitor: `/api/classes/${classId}/activities/${activityId}/exam-monitor`,
    timeline: `/api/classes/${classId}/activities/${activityId}/attempts/${attemptId}/integrity`,
    mute: `/api/classes/${classId}/activities/${activityId}/exam-alerts`,
  });
  /** One counted occurrence of the student, as the browser sends it. */
  const occur = async () => {
    const res = await recordEvents(api(t, { cookie: await loginAs(t, student) }), activityId, [integrityEvent("SCREEN_LEFT")]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    clock.advance(3000);
  };

  it("024/SC-004 o professor B recebe 404 na sala, nas ocorrências e no silenciar, e a prova não aparece na lista dele", async () => {
    const b = await teacherPhone(t, teacherB);
    const { monitor, timeline, mute } = paths();
    expect((await mobileApi(t, b.token).get("/api/mobile/exams")).body.items).toEqual([]);
    expect((await mobileApi(t, b.token).get(monitor)).status).toBe(404);
    expect((await mobileApi(t, b.token).get(timeline)).status).toBe(404);
    expect((await mobileApi(t, b.token).put(mute, { muted: true })).status).toBe(404);
    expect(await t.prisma.examAlertMute.count()).toBe(0);
  });

  it("024/SC-004 aluno, gestor e ADMIN recebem 403 na lista, na sala, nas ocorrências e no silenciar", async () => {
    const { monitor, timeline, mute } = paths();
    const others = { STUDENT: student, MANAGER: await createUser(t, { roles: ["MANAGER"] }), ADMIN: await createUser(t, { roles: ["ADMIN"] }) };
    for (const [role, user] of Object.entries(others)) {
      const client = api(t, { cookie: await loginAs(t, user) });
      const statuses = [
        (await client.get("/api/mobile/exams")).status,
        (await client.get(monitor)).status,
        (await client.get(timeline)).status,
        (await client.put(mute, { muted: true })).status,
      ];
      expect({ role, statuses }).toEqual({ role, statuses: [403, 403, 403, 403] });
    }
    expect(await t.prisma.examAlertMute.count()).toBe(0);
  });

  it("024/SC-004 nenhum aviso da turma de A chega ao celular de B; A recebe os seus", async () => {
    const a = await teacherPhone(t, teacherA);
    const b = await teacherPhone(t, teacherB);
    // Three warnings and the hold.
    for (let i = 0; i < 4; i += 1) await occur();
    await runAlertWorker(t, clock.now());
    expect(pushedTo(t, a.pushToken).map((message) => message.data.kind)).toEqual(["OCCURRENCE", "OCCURRENCE", "OCCURRENCE", "HOLD"]);
    expect(pushedTo(t, b.pushToken)).toEqual([]);
  });

  it('024/SC-004 depois do "Sair" e da revogação da sessão, nenhum aviso chega ao celular', async () => {
    const out = await teacherPhone(t, teacherA);
    const revoked = await teacherPhone(t, teacherA);
    expect((await mobileApi(t, out.token).delete("/api/auth/mobile/sessions/current")).status).toBe(204);
    const web = api(t, { cookie: await loginAs(t, teacherA) });
    const sessions = await web.get("/api/me/sessions");
    const target = (sessions.body.items as { id: string }[]).find((session) => session.id === revoked.sessionId);
    expect(target, "a sessão do celular aparece em Minhas sessões").toBeTruthy();
    expect((await web.delete(`/api/me/sessions/${revoked.sessionId}`)).status).toBe(204);
    await occur();
    await runAlertWorker(t, clock.now());
    expect(t.push.sent).toEqual([]);
    expect(await t.prisma.examAlert.findFirstOrThrow()).toMatchObject({ status: "SKIPPED" });
  });
});
