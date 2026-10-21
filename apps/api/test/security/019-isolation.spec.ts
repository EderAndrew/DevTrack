import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { createClassWithStudents, startAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { codeRunsPath, createCodeExercise, createRunWorker, doubles, getLatestRun, getRun, PRIVATE_RUN_MARKER, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 019 contracts/permissions.md, 019/SC-002: the run routes answer only the session student, inside
 * the 012 context (ACTIVE enrollment, published, not cancelled EXERCISE of their class, a CODE
 * question of that activity); outside → the same 404, never revealing what exists. Other roles have
 * no `atividades.proprias.executar` (403). The question, the attempt and the cases come from the
 * server, never the body. Complements `019-private-cases.spec.ts` with the run's own responses.
 */
describe("019/SC-002 isolamento das execuções de código", () => {
  let t: TestApp;
  let clock: FixedClock;
  let a1: Client;
  let a2: Client;
  let b1: Client;
  let activityA: { id: string; questionId: string };
  let activityB: { id: string; questionId: string };
  let enrollmentA2: string;
  let runA1: string;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    const teacherA = await createUser(t, { roles: ["TEACHER"] });
    const teacherB = await createUser(t, { roles: ["TEACHER"] });
    const classA = await createClassWithStudents(t, teacherA.id, { students: 2 });
    const classB = await createClassWithStudents(t, teacherB.id, { students: 1 });
    a1 = api(t, { cookie: await loginAs(t, classA.students[0]!) });
    a2 = api(t, { cookie: await loginAs(t, classA.students[1]!) });
    b1 = api(t, { cookie: await loginAs(t, classB.students[0]!) });
    enrollmentA2 = (await t.prisma.enrollment.findFirstOrThrow({ where: { studentUserId: classA.students[1]!.id } })).id;
    const createdA = await createCodeExercise(t, classA.schoolClass);
    const createdB = await createCodeExercise(t, classB.schoolClass);
    activityA = { id: createdA.activity.id, questionId: createdA.questionIds[0]! };
    activityB = { id: createdB.activity.id, questionId: createdB.questionIds[0]! };
    await seedHeartbeat(t, clock.now());
    for (const [client, id] of [
      [a1, activityA.id],
      [a2, activityA.id],
      [b1, activityB.id],
    ] as const) {
      expect((await startAttempt(client, id)).status).toBe(200);
    }
    const created = await requestRun(a1, activityA.id, activityA.questionId);
    expect(created.status).toBe(202);
    runA1 = created.body.id;
  });

  it("019/SC-002 a execução de outro aluno (da turma ou de outra) é 404, igual a um id inexistente", async () => {
    for (const client of [a2, b1]) {
      const res = await getRun(client, runA1);
      expect(res.status).toBe(404);
      expect(res.body).toEqual((await getRun(client, "00000000-0000-4000-8000-000000000000")).body);
    }
  });

  it("019/SC-002 atividade de outra turma, não publicada ou de matrícula inativa → 404 em criar e em latest", async () => {
    // Another class's activity, with its real question id.
    expect((await requestRun(a1, activityB.id, activityB.questionId)).status).toBe(404);
    expect((await getLatestRun(a1, activityB.id, activityB.questionId)).status).toBe(404);

    // Not published yet.
    const { classId, teacherId } = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activityB.id } });
    const scheduled = await createCodeExercise(t, { id: classId, teacherId }, { publishAt: new Date(clock.now().getTime() + DAY) });
    expect((await requestRun(b1, scheduled.activity.id, scheduled.questionIds[0]!)).status).toBe(404);

    // An inactive enrollment: A2 can no longer run nor read the latest of A's activity.
    await t.prisma.enrollment.update({ where: { id: enrollmentA2 }, data: { status: "REMOVED", removedAt: clock.now() } });
    expect((await requestRun(a2, activityA.id, activityA.questionId)).status).toBe(404);
    expect((await getLatestRun(a2, activityA.id, activityA.questionId)).status).toBe(404);

    const denied = await t.prisma.auditEvent.findMany({ where: { type: "student_access.denied" } });
    expect(denied.map((event) => (event.metadata as { reason: string }).reason).sort()).toEqual(["NOT_ENROLLED", "NOT_ENROLLED", "NOT_ENROLLED", "NOT_ENROLLED", "NOT_PUBLISHED"]);
    expect(await t.prisma.codeRun.count()).toBe(1);
  });

  it("019/SC-002 questão de outra atividade → 404", async () => {
    const { classId, teacherId } = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activityA.id } });
    const other = await createCodeExercise(t, { id: classId, teacherId });
    expect((await requestRun(a2, activityA.id, other.questionIds[0]!)).status).toBe(404);
    expect((await getLatestRun(a2, activityA.id, other.questionIds[0]!)).status).toBe(404);
    expect((await requestRun(a2, activityA.id, activityB.questionId)).status).toBe(404);
  });

  it("019/SC-002 TEACHER, MANAGER e ADMIN não executam nem leem execuções (403)", async () => {
    for (const role of ["TEACHER", "MANAGER", "ADMIN"] as const) {
      const client = api(t, { cookie: await loginAs(t, await createUser(t, { roles: [role] })) });
      expect((await requestRun(client, activityA.id, activityA.questionId)).status, role).toBe(403);
      expect((await getLatestRun(client, activityA.id, activityA.questionId)).status, role).toBe(403);
      expect((await getRun(client, runA1)).status, role).toBe(403);
    }
  });

  it("019/SC-002 campos do servidor no corpo → 400, sem execução criada", async () => {
    await createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }).worker.runOnce();
    const path = codeRunsPath(activityA.id, activityA.questionId);
    for (const extra of [
      { attemptId: "00000000-0000-4000-8000-000000000000" },
      { languageId: "00000000-0000-4000-8000-000000000000" },
      { testCases: [{ input: "1", expectedOutput: "2" }] },
      { status: "COMPLETED" },
      { questionId: activityB.questionId },
    ]) {
      const res = await a1.post(path, { sourceCode: "print(1)", ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    expect((await a1.post(path, {})).status).toBe(400);
    expect((await a1.post(path, { sourceCode: 42 })).status).toBe(400);
    expect(await t.prisma.codeRun.count()).toBe(1);
  });

  it("019/SC-002 as respostas de POST/GET da execução não trazem nada dos casos privados", async () => {
    await createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }).worker.runOnce();
    const again = await requestRun(a1, activityA.id, activityA.questionId);
    const responses = [again, await getRun(a1, runA1), await getLatestRun(a1, activityA.id, activityA.questionId), await a1.get(`/api/me/activities/${activityA.id}`)];
    for (const res of responses) {
      expect(res.status).toBeLessThan(300);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(PRIVATE_RUN_MARKER);
      expect(body).not.toMatch(/"visibility"|PRIVATE|privateCase|testCaseCount|"testCases"|testCaseId/);
    }
    const counted = (await getRun(a1, runA1)).body as { publicCaseCount: number; cases: unknown[] };
    expect(counted.publicCaseCount).toBe(2);
    expect(counted.cases).toHaveLength(2);
  });
});
