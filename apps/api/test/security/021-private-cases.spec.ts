import type { StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { createClassWithStudents, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createCodeWork, createRunWorker, DOUBLE_CASES, doubles, getLatestRun, getRun, PRIVATE_RUN_MARKER, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/** The 012 marker of a private case, carried by a second PRIVATE case of the work's CODE question. */
const PRIVATE_MARKER_012 = "MARCADOR-PRIVADO-012";
/** Anything that tells a student a private case exists, or how many there are. */
const PRIVATE_SIGNS = /"visibility"|PRIVATE|privateCase|testCaseCount|publicTestCaseCount|"testCases"/;

/**
 * 021/US1-3 021/SC-002 (research Y9): on a work applied with "Permitir executar o código", every
 * student response — the dashboard and lists, the activity, starting, saving, creating a run, the
 * latest run, one run and the submission — carries the PUBLIC cases only, with no input, expected
 * output or count of the private ones.
 */
describe("021/US1-3 021/SC-002 casos privados nunca chegam ao aluno de um trabalho com execução", () => {
  let t: TestApp;
  let clock: FixedClock;
  let student: Client;
  let activityId: string;
  let questionId: string;

  const reads = async () => [
    await student.get("/api/me/dashboard"),
    await student.get("/api/me/activities"),
    await student.get(`/api/me/activities/${activityId}`),
  ];
  const scan = (situation: string, responses: { status: number; body: unknown }[]) => {
    for (const res of responses) {
      expect(res.status, situation).toBeLessThan(300);
      const body = JSON.stringify(res.body);
      expect(body, situation).not.toContain(PRIVATE_RUN_MARKER);
      expect(body, situation).not.toContain(PRIVATE_MARKER_012);
      expect(body, situation).not.toMatch(PRIVATE_SIGNS);
    }
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    student = api(t, { cookie: await loginAs(t, created.students[0]!) });
    const work = await createCodeWork(t, created.schoolClass, {
      testCases: [...DOUBLE_CASES, { input: `${PRIVATE_MARKER_012} entrada\n`, expectedOutput: `${PRIVATE_MARKER_012} saída\n`, visibility: "PRIVATE" }],
    });
    activityId = work.activity.id;
    questionId = work.questionIds[0]!;
    await seedHeartbeat(t, clock.now());
  });

  it("021/US1-3 021/SC-002 abrir, iniciar, salvar, executar, latest, get e entregar: só os casos públicos, sem sinal dos privados", async () => {
    scan("pendente", await reads());
    const started = await startAttempt(student, activityId);
    const view = started.body as StudentActivity;
    expect(view.questions[0]!.publicTestCases).toEqual([
      { input: "1\n", expectedOutput: "2\n" },
      { input: "3\n", expectedOutput: "6\n" },
    ]);
    expect(view.questions[0]!.execution).toMatchObject({ status: "AVAILABLE" });
    const saved = await saveAnswers(student, activityId, [{ questionId, answer: { kind: "CODE", source: "print(int(input()) * 2)" }, baseRevision: 0 }]);

    const created = await requestRun(student, activityId, questionId);
    expect(created.status).toBe(202);
    const queued = [created, await getRun(student, created.body.id), await getLatestRun(student, activityId, questionId)];
    const { worker } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) });
    expect(await worker.runOnce()).toBe(1);
    const finished = await getRun(student, created.body.id);
    expect(finished.body).toMatchObject({ status: "COMPLETED", publicCaseCount: 2, passedCount: 2 });
    scan("em andamento", [started, saved, ...queued, finished, await getLatestRun(student, activityId, questionId), ...(await reads())]);

    const submitted = await submitAttempt(student, activityId);
    scan("entregue", [submitted, ...(await reads())]);
  });
});
