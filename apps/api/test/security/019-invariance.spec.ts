import type { RosterEntry, StudentActivity, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCase, FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { completeAttempt, createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createCodeExercise, createRunWorker, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

const RUNS = 50;

/**
 * 019/SC-004, FR-008: running code is a draft. Two students give the same answers; one ran nothing,
 * the other ran 50 times (passing, failing, a compilation error) before concluding. Their
 * conclusions, results, points, the teacher's roster and the ranking are identical.
 */
describe("019/SC-004 executar 0 ou 50 vezes não muda nada da 013", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacherClient: Client;
  let students: TestUser[];
  let clients: Client[];
  let classId: string;
  let activityId: string;
  let questionIds: string[];
  let alternativeId: string;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    const base = testConfig();
    t = await createTestApp({ clock, config: { rateLimit: { ...base.rateLimit, codeRunsPerMinute: 1_000 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createClassWithStudents(t, teacher.id, { students: 2 });
    classId = created.schoolClass.id;
    students = created.students;
    clients = await Promise.all(students.map(async (student) => api(t, { cookie: await loginAs(t, student) })));
    const activity = await createCodeExercise(t, created.schoolClass, {
      questions: [
        { type: "MULTIPLE_CHOICE", difficulty: "INTERMEDIATE" },
        { type: "CODE", languageKey: "python", difficulty: "ADVANCED", testCases: [{ input: "1\n", expectedOutput: "2\n", visibility: "PUBLIC" }] },
      ],
    });
    activityId = activity.activity.id;
    questionIds = activity.questionIds;
    alternativeId = activity.correctAlternativeIds[0]!;
    await seedHeartbeat(t, clock.now());
  });

  it("019/SC-004 019/FR-008 conclusões, resultados, pontos, fila do professor e ranking idênticos", async () => {
    for (const client of clients) expect((await startAttempt(client, activityId)).status).toBe(200);
    const sandbox = new FakeSandbox();
    const { worker } = createRunWorker(t, clock, { sandbox });
    const outcomes = [fakeCase({ stdout: "2\n" }), fakeCase({ stdout: "errado\n" }), fakeCase({ exitCode: 1, stderr: "erro" })];
    for (let index = 0; index < RUNS; index += 1) {
      if (index % 10 === 9) sandbox.failCompilation("SyntaxError");
      else sandbox.failCompilation(null).scriptCases(outcomes[index % 3]!);
      const res = await requestRun(clients[1]!, activityId, questionIds[1]!, `print(${index})`);
      expect(res.status).toBe(202);
      expect(await worker.runOnce()).toBe(1);
      clock.advance(1000);
    }
    expect(await t.prisma.codeRun.count({ where: { studentUserId: students[1]!.id, status: "COMPLETED" } })).toBe(RUNS);
    expect(await t.prisma.codeRun.count({ where: { studentUserId: students[0]!.id } })).toBe(0);

    const answers = [
      { questionId: questionIds[0]!, answer: { kind: "ALTERNATIVE" as const, alternativeId }, baseRevision: 0 },
      { questionId: questionIds[1]!, answer: { kind: "CODE" as const, source: "print(int(input()) * 2)" }, baseRevision: 0 },
    ];
    const views: StudentActivity[] = [];
    for (const client of clients) {
      const res = await completeAttempt(client, activityId, 1, answers);
      expect(res.status).toBe(200);
      views.push(res.body as StudentActivity);
    }

    const strip = (view: StudentActivity) => ({ status: view.status, points: view.points, completedAttempts: view.completedAttempts, lastResult: view.lastResult });
    expect(strip(views[1]!)).toEqual(strip(views[0]!));
    expect(views[0]!.points).toMatchObject({ earned: 30, awaitingCorrection: true });

    const results = async (student: TestUser) =>
      (await t.prisma.exerciseQuestionResult.findMany({ where: { attempt: { studentUserId: student.id } }, orderBy: { questionId: "asc" } })).map(
        ({ result, points, scoring }) => ({ result, points, scoring }),
      );
    expect(await results(students[1]!)).toEqual(await results(students[0]!));

    const detail = (await teacherClient.get(`/api/classes/${classId}/activities/${activityId}`)).body as TeacherActivity;
    const roster = detail.roster.map(({ studentUserId: _id, name: _name, attemptId: _attempt, ...rest }: RosterEntry) => rest);
    expect(roster).toHaveLength(2);
    expect(roster[1]).toEqual(roster[0]);

    const ranking = (await teacherClient.get(`/api/classes/${classId}/ranking`)).body as { rows: { position: number; points: number }[] };
    expect(ranking.rows.map((row) => [row.position, row.points])).toEqual([
      [1, 30],
      [1, 30],
    ]);
  });
});
