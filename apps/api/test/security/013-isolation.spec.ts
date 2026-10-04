import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { completeAttempt, createActivity, type CreatedActivity, retryAttempt, startAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
const START = "2026-10-01T12:00:00.000Z";
type Client = ReturnType<typeof api>;

interface Area {
  teacher: TestUser;
  schoolClass: SchoolClass;
  activity: CreatedActivity;
  /** Attempt 1 of the class's last student, concluded: the open answer waits for a mark. */
  attemptId: string;
}

/** Everything a refused call must leave as it was. */
async function snapshot(t: TestApp) {
  return {
    attempts: await t.prisma.activityAttempt.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, number: true, completedAt: true } }),
    results: await t.prisma.exerciseQuestionResult.findMany({
      orderBy: [{ attemptId: "asc" }, { questionId: "asc" }],
      select: { attemptId: true, questionId: true, result: true, points: true, scoring: true, comment: true, decidedAt: true },
    }),
    answers: await t.prisma.activityAnswer.count(),
    marked: await t.prisma.auditEvent.count({ where: { type: "exercise_result.marked" } }),
    completed: await t.prisma.auditEvent.count({ where: { type: "exercise_attempt.completed" } }),
  };
}

/**
 * 013/SC-006 (contracts/permissions.md), on the 012 cast: teachers A and B each with a class and an
 * EXERCISE activity; students A1 and A2 in A's class, B1 in B's, the last of each class with attempt 1
 * concluded. A's session on B's ranking, attempts and marks → 404; A1 on B's class ranking → 404, on
 * B's activity's attempts → 404 with `student_access.denied`, on A2's attempts by number → plain 404
 * (A1's own activity); STUDENT on the teacher's routes, TEACHER on the student's, ADMIN and MANAGER on
 * all → 403. Nothing changes.
 */
describe("013/SC-006 isolamento de ranking, tentativas por número e marcações", () => {
  let t: TestApp;
  let clock: FixedClock;
  let a: Area;
  let b: Area;
  let a1: TestUser;
  let a2: TestUser;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });

  async function area(name: string, students: TestUser[]): Promise<Area> {
    const teacher = await createUser(t, { roles: ["TEACHER"], name: `Professor ${name}` });
    const schoolClass = await createClass(t, teacher.id, { name: `Turma ${name}` });
    for (const student of students) await createEnrollment(t, schoolClass.id, student.id);
    const activity = await createActivity(t, schoolClass, {
      type: "EXERCISE",
      publishAt: at(-DAY),
      questions: [
        { type: "OPEN_ANSWER", difficulty: "INTERMEDIATE" },
        { type: "MULTIPLE_CHOICE", difficulty: "BASIC" },
      ],
    });
    const owner = students.at(-1)!;
    const client = api(t, { cookie: await loginAs(t, owner) });
    expect((await startAttempt(client, activity.activity.id)).status).toBe(200);
    const done = await completeAttempt(client, activity.activity.id, 1, [
      { questionId: activity.questionIds[0]!, answer: text(`Resposta de ${owner.name}`), baseRevision: 0 },
      { questionId: activity.questionIds[1]!, answer: { kind: "ALTERNATIVE", alternativeId: activity.correctAlternativeIds[1]! }, baseRevision: 0 },
    ]);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.activity.id, studentUserId: owner.id } });
    return { teacher, schoolClass, activity, attemptId: attempt.id };
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
  });

  it("013/SC-006 com a sessão do professor A, ranking, tentativa e marcação de B respondem 404 e nada muda", async () => {
    const client = api(t, { cookie: await loginAs(t, a.teacher) });
    const before = await snapshot(t);
    const marks = { marks: [{ questionId: b.activity.questionIds[0]!, result: "CORRECT", comment: "Invasão" }] };
    const attemptRoutes = (classId: string, activityId: string, attemptId: string) => {
      const base = `/api/classes/${classId}/activities/${activityId}/attempts/${attemptId}`;
      return [
        ["tentativa", () => client.get(base)],
        ["marcar", () => client.put(`${base}/marks`, marks)],
      ] as const;
    };
    const calls = [
      ["ranking", () => client.get(`/api/classes/${b.schoolClass.id}/ranking`)] as const,
      ...attemptRoutes(b.schoolClass.id, b.activity.activity.id, b.attemptId),
      // B's activity and attempt under A's own class, and B's attempt under A's own activity: still 404.
      ...attemptRoutes(a.schoolClass.id, b.activity.activity.id, b.attemptId),
      ...attemptRoutes(a.schoolClass.id, a.activity.activity.id, b.attemptId),
    ];
    for (const [name, call] of calls) {
      const res = await call();
      expect({ name, status: res.status, body: res.body }).toEqual({ name, status: 404, body: NOT_FOUND });
    }
    // A random class is the same 404.
    expect((await client.get(`/api/classes/${crypto.randomUUID()}/ranking`)).body).toEqual(NOT_FOUND);
    expect(await snapshot(t)).toEqual(before);
    // A's own ranking carries only A's students.
    const own = await client.get(`/api/classes/${a.schoolClass.id}/ranking`);
    expect(own.body.rows.map((row: { name: string }) => row.name).sort()).toEqual(["Aluno A1", "Aluno A2"]);
  });

  it("013/SC-006 o aluno A1: ranking de B → 404; tentativas da atividade de B → 404 com student_access.denied; tentativa de A2 → 404", async () => {
    const client = api(t, { cookie: await loginAs(t, a1) });
    const before = await snapshot(t);
    const denials = () => t.prisma.auditEvent.count({ where: { type: "student_access.denied" } });

    // The ranking of a class without an ACTIVE enrollment is 404, like a class that doesn't exist.
    const ranking = await client.get(`/api/me/classes/${b.schoolClass.id}/ranking`);
    expect([ranking.status, ranking.body]).toEqual([404, NOT_FOUND]);
    expect((await client.get(`/api/me/classes/${crypto.randomUUID()}/ranking`)).body).toEqual(NOT_FOUND);

    const id = b.activity.activity.id;
    const answers = [{ questionId: b.activity.questionIds[0]!, answer: text("x"), baseRevision: 0 }];
    const calls = [
      ["/me/activities/:activityId/attempts", () => retryAttempt(client, id, 1)],
      ["/me/activities/:activityId/attempts/:number/complete", () => client.post(`/api/me/activities/${id}/attempts/1/complete`, { answers })],
      ["/me/activities/:activityId/attempts/:number", () => client.get(`/api/me/activities/${id}/attempts/1`)],
    ] as const;
    for (const [route, call] of calls) {
      const res = await call();
      expect({ route, status: res.status, body: res.body }).toEqual({ route, status: 404, body: NOT_FOUND });
      const [last] = await t.prisma.auditEvent.findMany({ where: { type: "student_access.denied" }, orderBy: { id: "desc" }, take: 1 });
      expect(last).toMatchObject({ actorUserId: a1.id, targetId: id, metadata: { route, reason: "NOT_ENROLLED" } });
    }

    // A2 concluded attempt 1 of A's activity; A1 never started it: by number, A1 sees only their own (none).
    const denied = await denials();
    const mine = a.activity.activity.id;
    for (const number of [1, 2]) {
      const res = await client.get(`/api/me/activities/${mine}/attempts/${number}`);
      expect([number, res.status, res.body]).toEqual([number, 404, NOT_FOUND]);
    }
    expect((await retryAttempt(client, mine, 1)).status).not.toBe(200);
    expect(await denials()).toBe(denied);
    const view = await client.get(`/api/me/activities/${mine}`);
    expect([view.body.attempt, view.body.lastResult, view.body.completedAttempts]).toEqual([null, null, []]);
    expect(JSON.stringify(view.body)).not.toMatch(/Resposta de Aluno A2/);
    expect(await snapshot(t)).toEqual(before);
  });

  it("013/SC-006 papéis: ALUNO nas rotas do professor, PROFESSOR nas do aluno, ADMIN e GESTOR em todas → 403", async () => {
    const admin = await createUser(t, { roles: ["ADMIN"] });
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const classId = a.schoolClass.id;
    const activityId = a.activity.activity.id;
    const teacherRoutes = (client: Client) => [
      () => client.get(`/api/classes/${classId}/ranking`),
      () =>
        client.put(`/api/classes/${classId}/activities/${activityId}/attempts/${a.attemptId}/marks`, {
          marks: [{ questionId: a.activity.questionIds[0]!, result: "CORRECT" }],
        }),
    ];
    const studentRoutes = (client: Client) => [
      () => client.get(`/api/me/classes/${classId}/ranking`),
      () => retryAttempt(client, activityId, 1),
      () => client.post(`/api/me/activities/${activityId}/attempts/1/complete`, { answers: [] }),
      () => client.get(`/api/me/activities/${activityId}/attempts/1`),
    ];
    const before = await snapshot(t);
    const cases = [
      ["ALUNO", a2, teacherRoutes],
      ["PROFESSOR", a.teacher, studentRoutes],
      ["ADMIN", admin, (client: Client) => [...teacherRoutes(client), ...studentRoutes(client)]],
      ["GESTOR", manager, (client: Client) => [...teacherRoutes(client), ...studentRoutes(client)]],
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
