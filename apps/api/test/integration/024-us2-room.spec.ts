import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { holdByHand } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { examActivity, mobileApi, openMobileSession } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 024/US2 (research Y4, Y10, contracts/http-api.md): the app reads the room with the 018 routes, opened to
 * the mobile session and changed in nothing else — the same body as the web's at the same instant — and
 * the room of another teacher's class is a 404; every route that changes the exam stays on the computer.
 */
describe("024/US2 professor acompanha a sala da prova no celular", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let students: TestUser[];
  let schoolClass: { id: string; teacherId: string };
  let token: string;
  let cookie: string;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 3 });
    schoolClass = created.schoolClass;
    students = created.students;
    token = (await openMobileSession(t, teacher)).token;
    cookie = await loginAs(t, teacher);
  });

  /** An exam in progress: A held (4 occurrences), B answering, C present without an attempt. */
  const roomInProgress = async () => {
    const { activity } = await examActivity(t, schoolClass, { startedMinutesAgo: 5 });
    const now = new Date();
    for (const student of students) {
      await t.prisma.activityAttendance.create({
        data: { activityId: activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: now, markedById: teacher.id },
      });
    }
    const [a, b] = students as [TestUser, TestUser, TestUser];
    const held = await createAttemptRow(t, activity.id, a.id, { startedAt: new Date(now.getTime() - 60_000) });
    await holdByHand(t, { id: held.attemptId, activityId: activity.id, studentUserId: a.id });
    await createAttemptRow(t, activity.id, b.id, { startedAt: new Date(now.getTime() - 30_000) });
    return { activity, heldAttemptId: held.attemptId };
  };

  const monitorPath = (activityId: string) => `/api/classes/${schoolClass.id}/activities/${activityId}/exam-monitor`;

  it("024/SC-003 024/FR-007 a sala e as ocorrências pelo bearer são exatamente as da web no mesmo instante", async () => {
    const { activity, heldAttemptId } = await roomInProgress();
    const app = await mobileApi(t, token).get(monitorPath(activity.id));
    const web = await api(t, { cookie }).get(monitorPath(activity.id));
    expect(app.status).toBe(200);
    expect(app.body).toEqual(web.body);
    // The 018 order: the held student first.
    expect(app.body.students[0].examStatus).toBe("AWAITING_DECISION");

    const timelinePath = `/api/classes/${schoolClass.id}/activities/${activity.id}/attempts/${heldAttemptId}/integrity`;
    const appTimeline = await mobileApi(t, token).get(timelinePath);
    const webTimeline = await api(t, { cookie }).get(timelinePath);
    expect(appTimeline.status).toBe(200);
    expect(appTimeline.body).toEqual(webTimeline.body);
    // holdByHand records the four events at one instant, so only the set of ordinals is fixed.
    expect(appTimeline.body.events.map((event: { occurrenceOrdinal: number | null }) => event.occurrenceOrdinal).sort()).toEqual([1, 2, 3, 4]);
  });

  it("024/US2-1 a sala e as ocorrências de uma turma de outro professor são 404 pelo bearer, e a prova dele não aparece na lista", async () => {
    const { activity, heldAttemptId } = await roomInProgress();
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherToken = (await openMobileSession(t, other)).token;
    expect((await mobileApi(t, otherToken).get(monitorPath(activity.id))).status).toBe(404);
    const timeline = await mobileApi(t, otherToken).get(`/api/classes/${schoolClass.id}/activities/${activity.id}/attempts/${heldAttemptId}/integrity`);
    expect(timeline.status).toBe(404);
    expect((await mobileApi(t, otherToken).get("/api/mobile/exams")).body.items).toEqual([]);
    expect((await mobileApi(t, token).get("/api/mobile/exams")).body.items.map((item: { activityId: string }) => item.activityId)).toEqual([activity.id]);
  });

  it("024/US2-6 uma prova encerrada ou cancelada sai da lista de provas em andamento", async () => {
    const closing = await examActivity(t, schoolClass, { title: "Encerra agora" });
    const cancelling = await examActivity(t, schoolClass, { title: "Cancela agora" });
    expect((await mobileApi(t, token).get("/api/mobile/exams")).body.items).toHaveLength(2);
    await t.prisma.classActivity.update({ where: { id: closing.activity.id }, data: { status: "CLOSED", closedAt: new Date() } });
    await t.prisma.classActivity.update({ where: { id: cancelling.activity.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    expect((await mobileApi(t, token).get("/api/mobile/exams")).body.items).toEqual([]);
  });

  it("024/FR-010 decidir, fazer a chamada e pausar ficam no computador: 403 pelo bearer, nada muda", async () => {
    const { activity } = await roomInProgress();
    const hold = await t.prisma.examAttemptHold.findFirstOrThrow({ where: { activityId: activity.id } });
    const base = `/api/classes/${schoolClass.id}/activities/${activity.id}`;
    const client = api(t, { bearer: token });
    for (const [method, path] of [
      ["post", `${base}/exam-holds/${hold.id}/cancel`],
      ["post", `${base}/exam-holds/${hold.id}/return`],
      ["post", `${base}/exam-holds/${hold.id}/keep`],
      ["post", `${base}/attendance`],
      ["post", `${base}/students/${students[2]!.id}/pause`],
      ["post", `${base}/pauses/${randomUUID()}/release`],
    ] as const) {
      const res = await client[method](path, {});
      expect({ path, status: res.status, code: res.body.code }).toEqual({ path, status: 403, code: "MOBILE_ROUTE_NOT_ALLOWED" });
    }
    expect((await t.prisma.examAttemptHold.findUniqueOrThrow({ where: { id: hold.id } })).resolution).toBeNull();
    expect(await t.prisma.attemptPause.count()).toBe(0);
  });
});
