import type { CodeRun } from "@repo/contracts";
import { AttemptCodeRunSummarySchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCase, FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import { CODE_RUN_PURGE_BATCH_SIZE, CodeRunContentJob } from "../../src/modules/code-runs/content-retention.job";
import { createClassWithStudents, startAttempt, submitAttempt } from "../helpers/activities";
import { FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { asRun, createCodeWork, createRunWorker, doubles, getAttemptCodeRuns, getLatestRun, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 021 contracts/permissions.md (research Y7): the run summary answers only the teacher of the class
 * (`entregas.visualizar` and `ClassContextPolicy`); teacher B's class, an attempt of another activity
 * → the same 404; STUDENT, MANAGER and ADMIN → 403. 021/SC-005: what the student saw in `latest` is
 * what the teacher reads, before and after the 24 h purge.
 */
describe("021 isolamento do resumo das execuções", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacherA: TestUser;
  let teacherAClient: Client;
  let teacherBClient: Client;
  let student: Client;
  let classA: { id: string };
  let classB: { id: string };
  let activityA: string;
  let otherActivityA: string;
  let activityB: string;
  let questionA: string;
  let attemptA: string;
  let attemptB: string;
  let sandbox: FakeSandbox;
  let worker: CodeRunWorker;

  const path = (classId: string, activityId: string, attemptId: string) => `/api/classes/${classId}/activities/${activityId}/attempts/${attemptId}/code-runs`;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacherA = await createUser(t, { roles: ["TEACHER"] });
    const teacherB = await createUser(t, { roles: ["TEACHER"] });
    teacherAClient = api(t, { cookie: await loginAs(t, teacherA) });
    teacherBClient = api(t, { cookie: await loginAs(t, teacherB) });
    const a = await createClassWithStudents(t, teacherA.id, { students: 1 });
    const b = await createClassWithStudents(t, teacherB.id, { students: 1 });
    classA = a.schoolClass;
    classB = b.schoolClass;
    student = api(t, { cookie: await loginAs(t, a.students[0]!) });
    const studentB = api(t, { cookie: await loginAs(t, b.students[0]!) });
    const workA = await createCodeWork(t, a.schoolClass);
    const otherWorkA = await createCodeWork(t, a.schoolClass);
    const workB = await createCodeWork(t, b.schoolClass);
    activityA = workA.activity.id;
    otherActivityA = otherWorkA.activity.id;
    activityB = workB.activity.id;
    questionA = workA.questionIds[0]!;
    expect((await startAttempt(student, activityA)).status).toBe(200);
    expect((await startAttempt(studentB, activityB)).status).toBe(200);
    attemptA = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activityA } })).id;
    attemptB = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activityB } })).id;
    await seedHeartbeat(t, clock.now());
    ({ worker, sandbox } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }) as { worker: CodeRunWorker; sandbox: FakeSandbox });
  });

  it("021/FR-012 o resumo de outra turma (professor B) e a tentativa de outra atividade → 404, iguais a um id inexistente", async () => {
    expect((await getAttemptCodeRuns(teacherAClient, classA.id, activityA, attemptA)).status).toBe(200);
    const missing = await getAttemptCodeRuns(teacherAClient, classA.id, activityA, "00000000-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);
    for (const [client, url] of [
      [teacherBClient, path(classA.id, activityA, attemptA)],
      [teacherAClient, path(classB.id, activityB, attemptB)],
      [teacherBClient, path(classB.id, activityA, attemptA)],
      [teacherAClient, path(classA.id, otherActivityA, attemptA)],
      [teacherAClient, path(classA.id, activityB, attemptB)],
    ] as const) {
      const res = await client.get(url);
      expect({ url, status: res.status }).toEqual({ url, status: 404 });
      expect(res.body).toEqual(missing.body);
    }
  });

  it("021/FR-012 STUDENT, MANAGER e ADMIN → 403", async () => {
    const url = path(classA.id, activityA, attemptA);
    expect((await student.get(url)).status).toBe(403);
    for (const role of ["MANAGER", "ADMIN"] as const) {
      const client = api(t, { cookie: await loginAs(t, await createUser(t, { roles: [role] })) });
      expect({ role, status: (await client.get(url)).status }).toEqual({ role, status: 403 });
    }
  });

  it("021/SC-005 o número de execuções e os vereditos que o aluno viu em latest são os do resumo, antes e depois da limpeza", async () => {
    const seen: CodeRun[] = [];
    const runAndSee = async () => {
      const created = await requestRun(student, activityA, questionA);
      expect(created.status).toBe(202);
      expect(await worker.runOnce()).toBe(1);
      const latest = await getLatestRun(student, activityA, questionA);
      seen.push(asRun(latest.body.run));
    };
    await runAndSee();
    clock.advance(MINUTE);
    await seedHeartbeat(t, clock.now());
    sandbox.scriptCases(fakeCase({ stdout: "9\n" }), fakeCase({ stdout: "6\n" }));
    await runAndSee();
    const last = seen.at(-1)!;
    expect((await submitAttempt(student, activityA)).status).toBe(200);

    const expected = {
      runCount: seen.length,
      lastFinished: {
        status: last.status,
        outcome: last.outcome,
        publicCaseCount: last.publicCaseCount,
        passedCount: last.passedCount,
        finishedAt: last.finishedAt,
        cases: last.cases.map(({ position, verdict }) => ({ position, verdict })),
      },
    };
    const read = async () => AttemptCodeRunSummarySchema.parse((await getAttemptCodeRuns(teacherAClient, classA.id, activityA, attemptA)).body).questions[0];
    expect(await read()).toMatchObject(expected);
    clock.advance(25 * HOUR);
    expect(await t.get(CodeRunContentJob).run({ now: clock.now(), batchSize: CODE_RUN_PURGE_BATCH_SIZE })).toBe(2);
    expect(await read()).toMatchObject(expected);
  });
});
