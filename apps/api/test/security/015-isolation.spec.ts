import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, startAttempt } from "../helpers/activities";
import { drain, resetAiDb, type AiTestApp } from "../helpers/ai";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp, requestHelp, scriptHelp, validGuidance } from "../helpers/work-help";

const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
const START = "2026-10-01T12:00:00.000Z";
type Client = ReturnType<typeof api>;

interface Area {
  teacher: TestUser;
  schoolClass: SchoolClass;
  activity: CreatedActivity;
  /** The attempt of the class's last student: one exit recorded and one help delivered. */
  attemptId: string;
}

/** Everything a refused call must leave as it was. */
async function snapshot(t: AiTestApp) {
  return {
    events: await t.prisma.attemptIntegrityEvent.count(),
    helps: await t.prisma.workHelpRequest.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } }),
    executions: await t.prisma.aiExecution.count(),
    activities: await t.prisma.classActivity.findMany({ orderBy: { id: "asc" }, select: { id: true, executionMode: true, aiHelpAllowance: true } }),
  };
}

/**
 * 015/SC-008 (contracts/permissions.md), on the 012 cast: teachers A and B each with a class and a
 * CONTROLLED work with the help on; students A1 and A2 in A's class, B1 in B's, the last of each class
 * with an exit and a delivered help. A's session on B's summary, timeline and helps → 404; A1 on B's
 * activity → 404 with `student_access.denied`; A1 never sees A2's helps or events; STUDENT on the
 * teacher's routes, TEACHER on the student's, ADMIN and MANAGER on all → 403. Nothing changes.
 */
describe("015/SC-008 isolamento dos registros e das ajudas", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let a: Area;
  let b: Area;
  let a1: TestUser;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);

  async function area(name: string, students: TestUser[]): Promise<Area> {
    const teacher = await createUser(t, { roles: ["TEACHER"], name: `Professor ${name}` });
    const schoolClass = await createClass(t, teacher.id, { name: `Turma ${name}` });
    for (const student of students) await createEnrollment(t, schoolClass.id, student.id);
    const activity = await createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });
    const owner = students.at(-1)!;
    const client = api(t, { cookie: await loginAs(t, owner) });
    expect((await startAttempt(client, activity.activity.id)).status).toBe(200);
    expect((await recordEvents(client, activity.activity.id, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
    const help = await requestHelp(client, activity.activity.id, { questionId: activity.questionIds[0]!, question: `Pergunta de ${owner.name}` });
    expect(help.status, JSON.stringify(help.body)).toBe(202);
    scriptHelp(t.provider, help.body.id, validGuidance());
    await drain(t);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.activity.id, studentUserId: owner.id } });
    return { teacher, schoolClass, activity, attemptId: attempt.id };
  }

  /** Every 015 route of a student on `activityId`, with a valid body. */
  const studentRoutes = (client: Client, activity: CreatedActivity) => {
    const id = activity.activity.id;
    return [
      ["eventos", () => recordEvents(client, id, [integrityEvent("SCREEN_LEFT")])],
      ["registros", () => client.get(`/api/me/activities/${id}/attempt/integrity`)],
      ["pedir ajuda", () => requestHelp(client, id, { questionId: activity.questionIds[0]!, question: "Invasão?" })],
      ["ajudas", () => client.get(`/api/me/activities/${id}/attempt/help`)],
    ] as const;
  };
  /** Every 015 route of a teacher on the area's class, activity and attempt. */
  const teacherRoutes = (client: Client, classId: string, activityId: string, attemptId: string) => {
    const base = `/api/classes/${classId}/activities/${activityId}`;
    return [
      ["resumo", () => client.get(`${base}/integrity`)],
      ["linha do tempo", () => client.get(`${base}/attempts/${attemptId}/integrity`)],
      ["ajudas da tentativa", () => client.get(`${base}/attempts/${attemptId}/help`)],
      ["opções", () => client.patch(base, { version: 1, executionMode: "NORMAL", aiHelpAllowance: 0 })],
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
    a1 = await createUser(t, { roles: ["STUDENT"], name: "Aluno A1" });
    const a2 = await createUser(t, { roles: ["STUDENT"], name: "Aluno A2" });
    const b1 = await createUser(t, { roles: ["STUDENT"], name: "Aluno B1" });
    a = await area("A", [a1, a2]);
    b = await area("B", [b1]);
  });

  it("015/SC-008 com a sessão do professor A, resumo, linha do tempo, ajudas e opções de B respondem 404 e nada muda", async () => {
    const client = api(t, { cookie: await loginAs(t, a.teacher) });
    const before = await snapshot(t);
    const calls = [
      ...teacherRoutes(client, b.schoolClass.id, b.activity.activity.id, b.attemptId),
      // B's activity under A's class, and B's attempt under A's own activity: still 404.
      ...teacherRoutes(client, a.schoolClass.id, b.activity.activity.id, b.attemptId),
      ...teacherRoutes(client, a.schoolClass.id, a.activity.activity.id, b.attemptId).slice(1, 3),
      ...teacherRoutes(client, a.schoolClass.id, a.activity.activity.id, crypto.randomUUID()).slice(1, 3),
    ];
    for (const [name, call] of calls) {
      const res = await call();
      expect({ name, status: res.status, body: res.body }).toEqual({ name, status: 404, body: NOT_FOUND });
    }
    expect(await snapshot(t)).toEqual(before);
    // A's own summary carries only A's students.
    const own = await client.get(`/api/classes/${a.schoolClass.id}/activities/${a.activity.activity.id}/integrity`);
    expect(own.body.items.map((item: { attemptId: string }) => item.attemptId)).toEqual([a.attemptId]);
  });

  it("015/SC-008 o aluno A1 na atividade de B: 404 em todas as rotas, com student_access.denied, e nada muda", async () => {
    const client = api(t, { cookie: await loginAs(t, a1) });
    const before = await snapshot(t);
    for (const [name, call] of studentRoutes(client, b.activity)) {
      const res = await call();
      expect({ name, status: res.status, body: res.body }).toEqual({ name, status: 404, body: NOT_FOUND });
    }
    // A random activity is the same 404.
    expect((await client.get(`/api/me/activities/${crypto.randomUUID()}/attempt/help`)).body).toEqual(NOT_FOUND);
    expect(await snapshot(t)).toEqual(before);
    const denied = await t.prisma.auditEvent.findMany({ where: { type: "student_access.denied", actorUserId: a1.id, targetId: b.activity.activity.id } });
    expect(denied).toHaveLength(4);
  });

  it("015/SC-008 o colega A1 não vê as ajudas nem os registros de A2 na mesma atividade", async () => {
    const client = api(t, { cookie: await loginAs(t, a1) });
    const id = a.activity.activity.id;
    expect((await client.get(`/api/me/activities/${id}/attempt/help`)).body).toMatchObject({ used: 0, items: [] });
    expect((await client.get(`/api/me/activities/${id}/attempt/integrity`)).body).toEqual(NOT_FOUND);
  });

  it("papéis: aluno nas rotas do professor, professor nas do aluno, ADMIN e MANAGER em todas → 403, e nada muda", async () => {
    const before = await snapshot(t);
    const forbidden = async (client: Client, calls: readonly (readonly [string, () => Promise<{ status: number; body: unknown }>])[], who: string) => {
      for (const [name, call] of calls) {
        const res = await call();
        expect({ who, name, status: res.status }).toEqual({ who, name, status: 403 });
      }
    };
    const student = api(t, { cookie: await loginAs(t, a1) });
    await forbidden(student, [...teacherRoutes(student, a.schoolClass.id, a.activity.activity.id, a.attemptId), ["disponibilidade", () => student.get("/api/work-help/availability")]], "aluno");
    const teacher = api(t, { cookie: await loginAs(t, a.teacher) });
    await forbidden(teacher, studentRoutes(teacher, a.activity), "professor");
    for (const role of ["ADMIN", "MANAGER"] as const) {
      const client = api(t, { cookie: await loginAs(t, await createUser(t, { roles: [role] })) });
      await forbidden(
        client,
        [
          ...studentRoutes(client, a.activity),
          ...teacherRoutes(client, a.schoolClass.id, a.activity.activity.id, a.attemptId),
          ["disponibilidade", () => client.get("/api/work-help/availability")],
        ],
        role,
      );
    }
    expect(await snapshot(t)).toEqual(before);
  });
});
