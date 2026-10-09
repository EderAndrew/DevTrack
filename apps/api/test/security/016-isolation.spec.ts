import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { getRoom, markPresent } from "../helpers/attendance";
import { resetAiDb, type AiTestApp } from "../helpers/ai";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp, requestHelp } from "../helpers/work-help";

const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
const START = "2026-10-01T12:00:00.000Z";
type Client = ReturnType<typeof api>;

/** Everything a refused call must leave as it was. */
async function snapshot(t: AiTestApp) {
  return {
    attendances: await t.prisma.activityAttendance.findMany({ orderBy: [{ activityId: "asc" }, { studentUserId: "asc" }] }),
    attempts: await t.prisma.activityAttempt.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } }),
    answers: await t.prisma.activityAnswer.count(),
    events: await t.prisma.attemptIntegrityEvent.count(),
    helps: await t.prisma.workHelpRequest.count(),
    pauses: await t.prisma.attemptPause.count(),
  };
}

/**
 * 016/SC-001 (contracts/permissions.md), on the 012/015 cast: teachers A and B, each with a class and
 * a `PRESENT_ONLY` CONTROLLED work with the AI help; A1 marked present in A's work and answering, A2
 * in A's class and not marked, B1 in B's class. A2 gets the same 404 as an activity of another class
 * on every student route — list, dashboard, detail, start, save, submit, the 015 events and help and
 * the 016 pause — with no title and no hint of existence; teacher B gets 404 on A's attendance; ADMIN
 * and MANAGER 403. No answer to a student carries the attendance or another student's presence.
 */
describe("016/SC-001 isolamento do aluno não marcado presente", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let teacherA: TestUser;
  let teacherB: TestUser;
  let classA: SchoolClass;
  let a1: TestUser;
  let a2: TestUser;
  let workA: CreatedActivity;
  let workB: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const work = (schoolClass: SchoolClass) =>
    createActivity(t, schoolClass, {
      title: `Trabalho secreto ${schoolClass.name}`,
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      releaseMode: "PRESENT_ONLY",
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });

  /** Every student route on `activity`, with a valid body: the 012 portal, 015 and the 016 pause. */
  const studentRoutes = (client: Client, activity: CreatedActivity) => {
    const id = activity.activity.id;
    const answer = { questionId: activity.questionIds[0]!, answer: { kind: "TEXT" as const, text: "Invasão" }, baseRevision: 0 };
    return [
      ["detalhe", () => client.get(`/api/me/activities/${id}`)],
      ["início", () => startAttempt(client, id)],
      ["salvamento", () => saveAnswers(client, id, [answer])],
      ["entrega", () => submitAttempt(client, id, [answer])],
      ["eventos", () => recordEvents(client, id, [integrityEvent("SCREEN_LEFT")])],
      ["registros", () => client.get(`/api/me/activities/${id}/attempt/integrity`)],
      ["pedir ajuda", () => requestHelp(client, id, { questionId: activity.questionIds[0]!, question: "Invasão?" })],
      ["ajudas", () => client.get(`/api/me/activities/${id}/attempt/help`)],
      ["pausa", () => client.post(`/api/me/activities/${id}/attempt/pause`, { reason: "WATER" })],
      ["leitura da pausa", () => client.get(`/api/me/activities/${id}/attempt/pause`)],
    ] as const;
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createWorkHelpApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, workHelpPerHour: 100 } } });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    clock.set(START);
    teacherA = await createUser(t, { roles: ["TEACHER"], name: "Professor A" });
    teacherB = await createUser(t, { roles: ["TEACHER"], name: "Professor B" });
    a1 = await createUser(t, { roles: ["STUDENT"], name: "Aluno A1" });
    a2 = await createUser(t, { roles: ["STUDENT"], name: "Aluno A2" });
    const b1 = await createUser(t, { roles: ["STUDENT"], name: "Aluno B1" });
    classA = await createClass(t, teacherA.id, { name: "Turma A" });
    const classB = await createClass(t, teacherB.id, { name: "Turma B" });
    await createEnrollment(t, classA.id, a1.id);
    await createEnrollment(t, classA.id, a2.id);
    await createEnrollment(t, classB.id, b1.id);
    workA = await work(classA);
    workB = await work(classB);
    const teacherClient = api(t, { cookie: await loginAs(t, teacherA) });
    expect((await markPresent(teacherClient, classA.id, workA.activity.id, [a1.id])).status).toBe(200);
    expect((await markPresent(api(t, { cookie: await loginAs(t, teacherB) }), classB.id, workB.activity.id, [b1.id])).status).toBe(200);
    expect((await startAttempt(api(t, { cookie: await loginAs(t, a1) }), workA.activity.id)).status).toBe(200);
  });

  it("016/SC-001 o aluno A2, não marcado: 404 sem título nem existência em todas as rotas do aluno, com student_access.denied NOT_PRESENT", async () => {
    const client = api(t, { cookie: await loginAs(t, a2) });
    const before = await snapshot(t);
    for (const [name, call] of studentRoutes(client, workA)) {
      const res = await call();
      expect({ name, status: res.status, body: res.body }).toEqual({ name, status: 404, body: NOT_FOUND });
    }
    const list = await client.get("/api/me/activities");
    const dashboard = await client.get("/api/me/dashboard");
    for (const res of [list, dashboard]) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(workA.activity.id);
      expect(JSON.stringify(res.body)).not.toContain("Trabalho secreto");
    }
    expect(list.body.items).toEqual([]);
    expect(await snapshot(t)).toEqual(before);
    const denied = await t.prisma.auditEvent.findMany({ where: { type: "student_access.denied", actorUserId: a2.id, targetId: workA.activity.id } });
    // Every route that reads or writes the activity by id audits the refusal, always as NOT_PRESENT.
    expect(denied.length).toBeGreaterThanOrEqual(8);
    expect(new Set(denied.map((event) => (event.metadata as { reason: string }).reason))).toEqual(new Set(["NOT_PRESENT"]));
  });

  it("016/SC-001 016/FR-010 A1, presente, não recebe a chamada nem a presença de A2 em nenhuma resposta", async () => {
    const client = api(t, { cookie: await loginAs(t, a1) });
    for (const res of [
      await client.get("/api/me/activities"),
      await client.get("/api/me/dashboard"),
      await client.get(`/api/me/activities/${workA.activity.id}`),
    ]) {
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(a2.id);
      expect(text).not.toMatch(/"attendance"|"markedAt"|"present"|"enrolled"/);
    }
    // A1 on B's work: the same 404 as any activity outside the context.
    expect((await client.get(`/api/me/activities/${workB.activity.id}`)).body).toEqual(NOT_FOUND);
  });

  it("016/SC-001 o professor B na chamada de A → 404, e nada muda", async () => {
    const client = api(t, { cookie: await loginAs(t, teacherB) });
    const before = await snapshot(t);
    expect((await getRoom(client, classA.id, workA.activity.id)).body).toEqual(NOT_FOUND);
    expect((await markPresent(client, classA.id, workA.activity.id, [a2.id])).body).toEqual(NOT_FOUND);
    // A's activity under B's own class: still 404.
    const ownClass = workB.activity.classId;
    expect((await getRoom(client, ownClass, workA.activity.id)).body).toEqual(NOT_FOUND);
    expect((await markPresent(client, ownClass, workA.activity.id, [a2.id])).body).toEqual(NOT_FOUND);
    expect(await snapshot(t)).toEqual(before);
  });

  it("016/SC-001 ADMIN, MANAGER e aluno na chamada → 403, e nada muda", async () => {
    const before = await snapshot(t);
    const clients = [
      api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) }),
      api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["MANAGER"] })) }),
      api(t, { cookie: await loginAs(t, a1) }),
    ];
    for (const client of clients) {
      expect((await getRoom(client, classA.id, workA.activity.id)).status).toBe(403);
      expect((await markPresent(client, classA.id, workA.activity.id, [a2.id])).status).toBe(403);
    }
    expect(await snapshot(t)).toEqual(before);
  });
});
