import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, createAttemptRow } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
const START = "2026-10-01T12:00:00.000Z";

interface Area {
  teacher: TestUser;
  schoolClass: SchoolClass;
  activity: CreatedActivity;
  /** A submitted attempt of a student of the class. */
  attemptId: string;
}

/** Everything a refused call must leave as it was. */
async function snapshot(t: TestApp) {
  return {
    activities: await t.prisma.classActivity.findMany({
      orderBy: { id: "asc" },
      select: { id: true, status: true, version: true, title: true, resultReleasedAt: true },
    }),
    attempts: await t.prisma.activityAttempt.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, lastSavedAt: true } }),
    answers: await t.prisma.activityAnswer.count(),
    submissions: await t.prisma.activitySubmission.findMany({ orderBy: { id: "asc" }, select: { id: true, version: true, gradePartial: true } }),
  };
}

/**
 * 012/SC-002 012/FR-008 012/FR-009 (contracts/permissions.md): teachers A and B each with a class
 * and an activity; students A1 and A2 in A's class, B1 in B's. A's session on B's ids answers 404
 * on every teacher route; A1 on B's activity, on a scheduled and on a cancelled one answers 404 and
 * writes `student_access.denied`, and never sees A2's work; STUDENT on teacher routes, TEACHER on
 * student routes, ADMIN and MANAGER on every route → 403. Nothing changes.
 */
describe("012/SC-002 isolamento de atividades, tentativas e entregas", () => {
  let t: TestApp;
  let clock: FixedClock;
  let a: Area;
  let b: Area;
  let a1: TestUser;
  let a2: TestUser;
  let scheduled: CreatedActivity;
  let cancelled: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });

  async function area(name: string, students: TestUser[]): Promise<Area> {
    const teacher = await createUser(t, { roles: ["TEACHER"], name: `Professor ${name}` });
    const schoolClass = await createClass(t, teacher.id, { name: `Turma ${name}` });
    for (const student of students) await createEnrollment(t, schoolClass.id, student.id);
    const activity = await createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });
    const owner = students.at(-1)!;
    const { attemptId } = await createAttemptRow(t, activity.activity.id, owner.id);
    await t.prisma.activityAnswer.create({
      data: {
        attemptId,
        activityId: activity.activity.id,
        questionId: activity.questionIds[0]!,
        questionType: "OPEN_ANSWER",
        text: `Resposta de ${owner.name}`,
        savedAt: at(0),
      },
    });
    await t.prisma.activityAttempt.update({ where: { id: attemptId }, data: { status: "SUBMITTED" } });
    await t.prisma.activitySubmission.create({
      data: { attemptId, activityId: activity.activity.id, studentUserId: owner.id, submittedAt: at(0), late: false, blankCount: 0, grade: "0.00", gradePartial: true },
    });
    return { teacher, schoolClass, activity, attemptId };
  }

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    a1 = await createUser(t, { roles: ["STUDENT"], name: "Aluno A1" });
    a2 = await createUser(t, { roles: ["STUDENT"], name: "Aluno A2" });
    const b1 = await createUser(t, { roles: ["STUDENT"], name: "Aluno B1" });
    a = await area("A", [a1, a2]);
    b = await area("B", [b1]);
    scheduled = await createActivity(t, a.schoolClass, { publishAt: at(DAY), deadline: at(7 * DAY) });
    cancelled = await createActivity(t, a.schoolClass, { publishAt: at(-DAY), deadline: at(7 * DAY), status: "CANCELLED" });
  });

  it("012/FR-009 com a sessão do professor A, toda rota do professor sobre ids de B responde 404 e nada muda", async () => {
    const client = api(t, { cookie: await loginAs(t, a.teacher) });
    const before = await snapshot(t);
    const grades = { version: 1, decisions: [{ questionId: b.activity.questionIds[0]!, grade: "0.10" }] };
    const routes = (classId: string, activityId: string, attemptId: string) => {
      const base = `/api/classes/${classId}/activities`;
      return [
        ["listar", () => client.get(base)],
        ["escopo", () => client.post(`${base}/scope-check`, { type: "EXERCISE", exerciseIds: [crypto.randomUUID()] })],
        [
          "aplicar",
          () =>
            client.post(base, {
              idempotencyKey: crypto.randomUUID(),
              source: { type: "EXERCISE", exerciseIds: [crypto.randomUUID()] },
              title: "x",
              publishAt: null,
              acknowledgeOutOfScope: true,
            }),
        ],
        ["detalhe", () => client.get(`${base}/${activityId}`)],
        ["editar", () => client.patch(`${base}/${activityId}`, { version: 1, title: "Outro" })],
        ["encerrar", () => client.post(`${base}/${activityId}/close`, {})],
        ["cancelar", () => client.post(`${base}/${activityId}/cancel`, {})],
        ["liberar", () => client.post(`${base}/${activityId}/release`, {})],
        ["tentativa", () => client.get(`${base}/${activityId}/attempts/${attemptId}`)],
        ["corrigir", () => client.put(`${base}/${activityId}/attempts/${attemptId}/grades`, grades)],
        ["aceitar", () => client.post(`${base}/${activityId}/attempts/${attemptId}/accept-submission`, {})],
      ] as const;
    };
    const calls = [
      ...routes(b.schoolClass.id, b.activity.activity.id, b.attemptId),
      // B's activity and attempt under A's own class: still 404.
      ...routes(a.schoolClass.id, b.activity.activity.id, b.attemptId).slice(3),
      // B's attempt under A's own activity.
      ...routes(a.schoolClass.id, a.activity.activity.id, b.attemptId).slice(8),
    ];
    for (const [name, call] of calls) {
      const res = await call();
      expect({ name, status: res.status, body: res.body }).toEqual({ name, status: 404, body: NOT_FOUND });
    }
    expect(await snapshot(t)).toEqual(before);
    const own = await client.get(`/api/classes/${a.schoolClass.id}/activities`);
    expect(own.body.items.map((item: { id: string }) => item.id).sort()).toEqual(
      [a.activity.activity.id, scheduled.activity.id, cancelled.activity.id].sort(),
    );
  });

  it("012/FR-008 o aluno A1 recebe 404 com student_access.denied na atividade de B, na agendada e na cancelada", async () => {
    const client = api(t, { cookie: await loginAs(t, a1) });
    const before = await snapshot(t);
    const cases = [
      [b.activity, "NOT_ENROLLED"],
      [scheduled, "NOT_PUBLISHED"],
      [cancelled, "CANCELLED"],
    ] as const;
    for (const [created, reason] of cases) {
      const id = created.activity.id;
      const answers = [{ questionId: created.questionIds[0]!, answer: text("x"), baseRevision: 0 }];
      const calls = [
        ["/me/activities/:activityId", () => client.get(`/api/me/activities/${id}`)],
        ["/me/activities/:activityId/attempt", () => client.post(`/api/me/activities/${id}/attempt`, {})],
        ["/me/activities/:activityId/attempt/answers", () => client.put(`/api/me/activities/${id}/attempt/answers`, { answers })],
        ["/me/activities/:activityId/attempt/submit", () => client.post(`/api/me/activities/${id}/attempt/submit`, { answers: [] })],
      ] as const;
      for (const [route, call] of calls) {
        const res = await call();
        expect({ route, reason, status: res.status, body: res.body }).toEqual({ route, reason, status: 404, body: NOT_FOUND });
        const [last] = await t.prisma.auditEvent.findMany({ where: { type: "student_access.denied" }, orderBy: { id: "desc" }, take: 1 });
        expect(last).toMatchObject({ actorUserId: a1.id, targetId: id, metadata: { route, reason } });
      }
    }
    // A random id is the same 404, with nothing to audit.
    const denied = await t.prisma.auditEvent.count({ where: { type: "student_access.denied" } });
    expect((await client.get(`/api/me/activities/${crypto.randomUUID()}`)).body).toEqual(NOT_FOUND);
    expect(await t.prisma.auditEvent.count({ where: { type: "student_access.denied" } })).toBe(denied);
    expect(await snapshot(t)).toEqual(before);

    // The lists carry only A1's class, and nothing of A2's work.
    const list = await client.get("/api/me/activities");
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([a.activity.activity.id]);
    const own = await client.get(`/api/me/activities/${a.activity.activity.id}`);
    expect([own.body.attempt, own.body.submission, own.body.status]).toEqual([null, null, "PENDING"]);
    // Since 013 (FR-020) the dashboard ranking names A1's classmates, and nothing else of them; never B1.
    const { rankings, ...board } = (await client.get("/api/me/dashboard")).body;
    expect(JSON.stringify([list.body, own.body, board])).not.toMatch(/Aluno A2|Aluno B1/);
    expect(JSON.stringify(rankings)).not.toMatch(/Aluno B1/);
  });

  it("012/SC-002 papéis: ALUNO nas rotas do professor, PROFESSOR nas do aluno, ADMIN e GESTOR em todas → 403", async () => {
    const admin = await createUser(t, { roles: ["ADMIN"] });
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const classId = a.schoolClass.id;
    const activityId = a.activity.activity.id;
    const base = `/api/classes/${classId}/activities`;
    const teacherRoutes = (client: ReturnType<typeof api>) => [
      () => client.get(base),
      () => client.post(`${base}/scope-check`, { type: "EXERCISE", exerciseIds: [crypto.randomUUID()] }),
      () => client.post(base, {}),
      () => client.get(`${base}/${activityId}`),
      () => client.patch(`${base}/${activityId}`, { version: 1 }),
      () => client.post(`${base}/${activityId}/close`, {}),
      () => client.post(`${base}/${activityId}/cancel`, {}),
      () => client.post(`${base}/${activityId}/release`, {}),
      () => client.get(`${base}/${activityId}/attempts/${a.attemptId}`),
      () => client.put(`${base}/${activityId}/attempts/${a.attemptId}/grades`, { version: 1, decisions: [] }),
      () => client.post(`${base}/${activityId}/attempts/${a.attemptId}/accept-submission`, {}),
    ];
    const studentRoutes = (client: ReturnType<typeof api>) => [
      () => client.get("/api/me/dashboard"),
      () => client.get("/api/me/activities"),
      () => client.get(`/api/me/activities/${activityId}`),
      () => client.post(`/api/me/activities/${activityId}/attempt`, {}),
      () => client.put(`/api/me/activities/${activityId}/attempt/answers`, { answers: [] }),
      () => client.post(`/api/me/activities/${activityId}/attempt/submit`, { answers: [] }),
    ];
    const before = await snapshot(t);
    const cases = [
      ["ALUNO", a1, teacherRoutes],
      ["PROFESSOR", a.teacher, studentRoutes],
      ["ADMIN", admin, (client: ReturnType<typeof api>) => [...teacherRoutes(client), ...studentRoutes(client)]],
      ["GESTOR", manager, (client: ReturnType<typeof api>) => [...teacherRoutes(client), ...studentRoutes(client)]],
    ] as const;
    for (const [role, user, routesOf] of cases) {
      const client = api(t, { cookie: await loginAs(t, user) });
      const statuses = [];
      for (const call of routesOf(client)) statuses.push((await call()).status);
      expect({ role, statuses }).toEqual({ role, statuses: statuses.map(() => 403) });
    }
    expect(await snapshot(t)).toEqual(before);
  });
});
