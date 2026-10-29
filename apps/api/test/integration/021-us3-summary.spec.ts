import type { Answer, AttemptCodeRunSummary, TeacherAttempt } from "@repo/contracts";
import { AttemptCodeRunSummarySchema, TeacherAttemptSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCase, FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { CODE_RUN_PURGE_BATCH_SIZE, CodeRunContentJob } from "../../src/modules/code-runs/content-retention.job";
import { createActivity, type CreatedActivity, createAttemptRow, createClassWithStudents, getAttempt, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { markPresent } from "../helpers/attendance";
import { FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { asRun, createCodeExercise, createCodeWork, createRunWorker, doubles, getAttemptCodeRuns, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/** Keys a run summary never carries (021/FR-013). */
const CONTENT_KEYS = ["sourceCode", "stdout", "stderr", "compileOutput", "input", "expectedOutput"];

/**
 * 021/US3 (research Y7, Y8): on a student's attempt in a work with the option, the teacher reads, per
 * CODE question, how many runs the student made, whether one is pending and the last finished run's
 * status, counts, per-case verdicts and server time — never code, input, output, stderr or a compiler
 * message, and the same answer after the 24 h purge. Not a grade: the 012 review does not change.
 */
describe("021/US3 professor vê o resumo das execuções na correção", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let students: TestUser[];
  let student: Client;
  let schoolClass: SchoolClass;
  let work: CreatedActivity;
  let activityId: string;
  let questionId: string;
  let sandbox: FakeSandbox;
  let worker: CodeRunWorker;

  const start = async (id = activityId) => {
    expect((await startAttempt(student, id)).status).toBe(200);
    return (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: id, studentUserId: students[0]!.id } })).id;
  };
  const queued = async (sourceCode?: string) => {
    const res = await requestRun(student, activityId, questionId, sourceCode);
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    return asRun(res.body);
  };
  const executed = async (sourceCode?: string) => {
    const created = await queued(sourceCode);
    expect(await worker.runOnce()).toBe(1);
    return created;
  };
  /** Moves the server clock; the worker stays alive (a fresh heartbeat). */
  const advance = async (ms: number) => {
    clock.advance(ms);
    await seedHeartbeat(t, clock.now());
  };
  const summary = async (attemptId: string, id = activityId) => {
    const res = await getAttemptCodeRuns(teacherClient, schoolClass.id, id, attemptId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return AttemptCodeRunSummarySchema.parse(res.body);
  };
  const code = (source: string): Answer => ({ kind: "CODE", source });

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = created.schoolClass;
    students = created.students;
    student = api(t, { cookie: await loginAs(t, students[0]!) });
    work = await createCodeWork(t, schoolClass);
    activityId = work.activity.id;
    questionId = work.questionIds[0]!;
    await seedHeartbeat(t, clock.now());
    ({ worker, sandbox } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }) as { worker: CodeRunWorker; sandbox: FakeSandbox });
  });

  it("021/US3-1 três execuções, a última 1 de 2: runCount 3 e os vereditos da última por posição, com o momento do servidor", async () => {
    const attemptId = await start();
    await executed();
    await advance(MINUTE);
    await executed();
    await advance(MINUTE);
    sandbox.scriptCases(fakeCase({ stdout: "2\n" }), fakeCase({ stdout: "7\n" }));
    await executed("print(2)\n");
    const finishedAt = clock.now().toISOString();
    expect((await submitAttempt(student, activityId)).status).toBe(200);

    expect(await summary(attemptId)).toEqual({
      questions: [
        {
          questionId,
          runCount: 3,
          pending: false,
          lastFinished: {
            status: "COMPLETED",
            failureReason: null,
            outcome: "EXECUTED",
            publicCaseCount: 2,
            passedCount: 1,
            finishedAt,
            cases: [
              { position: 0, verdict: "PASSED" },
              { position: 1, verdict: "WRONG_OUTPUT" },
            ],
          },
        },
      ],
    });
  });

  it("021/US3-2 última com erro de compilação: outcome sem casos e sem mensagem; última FAILED: o motivo", async () => {
    const attemptId = await start();
    sandbox.failCompilation("SyntaxError: MARCADOR-COMPILADOR-021");
    await executed("print(\n");
    const compiled = await summary(attemptId);
    expect(compiled.questions[0]!.lastFinished).toMatchObject({ status: "COMPLETED", outcome: "COMPILATION_ERROR", failureReason: null, passedCount: 0, cases: [] });
    expect(JSON.stringify(compiled)).not.toContain("MARCADOR-COMPILADOR-021");

    // A run nobody claims expires past its queue deadline; the summary's read settles it first.
    await advance(MINUTE);
    await queued();
    clock.advance(2 * MINUTE);
    const failed = await summary(attemptId);
    expect(failed.questions[0]).toMatchObject({
      runCount: 2,
      pending: false,
      lastFinished: { status: "FAILED", failureReason: "EXPIRED", outcome: null, passedCount: null, cases: [] },
    });
  });

  it("021/US3-3 nenhuma execução: runCount 0 e lastFinished nulo; só as questões de Código aparecem", async () => {
    const attemptId = await start();
    expect(await summary(attemptId)).toEqual({ questions: [{ questionId, runCount: 0, pending: false, lastFinished: null }] });
  });

  it("021/US3-4 depois do job code-run-content, a resposta é idêntica e nunca tem chave de conteúdo", async () => {
    const attemptId = await start();
    await executed("print(int(input()) * 2)  # MARCADOR-CODIGO-021\n");
    await advance(MINUTE);
    sandbox.failCompilation("erro MARCADOR-CODIGO-021");
    await executed("print(\n");
    sandbox.failCompilation(null);
    await advance(MINUTE);
    await executed();
    expect((await submitAttempt(student, activityId)).status).toBe(200);

    const before = await summary(attemptId);
    clock.advance(25 * HOUR);
    expect(await t.get(CodeRunContentJob).run({ now: clock.now(), batchSize: CODE_RUN_PURGE_BATCH_SIZE })).toBe(3);
    expect(await t.prisma.codeRun.count({ where: { contentPurgedAt: null } })).toBe(0);
    const after = await summary(attemptId);
    expect(after).toEqual(before);

    const raw = JSON.stringify(after);
    expect(raw).not.toContain("MARCADOR-CODIGO-021");
    for (const key of CONTENT_KEYS) expect(raw).not.toContain(`"${key}"`);
  });

  it("021/US3-5 trabalho sem a opção, EXERCISE ou EXAM → 404", async () => {
    const without = await createCodeWork(t, schoolClass, { codeExecutionAllowed: false });
    const exercise = await createCodeExercise(t, schoolClass);
    const exam = await createActivity(t, schoolClass, { type: "EXAM", questions: [{ type: "CODE", languageKey: "python" }] });
    // An exam attempt needs the student marked present (016).
    expect((await markPresent(teacherClient, schoolClass.id, exam.activity.id, [students[0]!.id])).status).toBe(200);
    for (const activity of [without, exercise, exam]) {
      const { attemptId } = await createAttemptRow(t, activity.activity.id, students[0]!.id, { startedAt: clock.now() });
      const res = await getAttemptCodeRuns(teacherClient, schoolClass.id, activity.activity.id, attemptId);
      expect({ type: activity.activity.type, status: res.status }).toEqual({ type: activity.activity.type, status: 404 });
    }
  });

  it("021/US3-6 a correção da 012 não muda com as execuções: nenhuma nota sugerida ou preenchida", async () => {
    const attemptId = await start();
    expect((await saveAnswers(student, activityId, [{ questionId, answer: code("resposta salva"), baseRevision: 0 }])).status).toBe(200);
    await executed();
    expect((await submitAttempt(student, activityId)).status).toBe(200);
    expect((await summary(attemptId)).questions[0]!.lastFinished).toMatchObject({ passedCount: 2 });

    const res = await getAttempt(teacherClient, schoolClass.id, activityId, attemptId);
    expect(res.status).toBe(200);
    const review: TeacherAttempt = TeacherAttemptSchema.parse(res.body);
    expect(review.submission!.gradings.find((grading) => grading.questionId === questionId)).toMatchObject({ status: "PENDING_TEACHER", finalGrade: null });
    expect(JSON.stringify(review)).not.toContain("runCount");
  });

  it("021/FR-012 pending verdadeiro com uma execução na fila, e a última terminada continua mostrada", async () => {
    const attemptId = await start();
    await executed();
    await advance(MINUTE);
    await queued();
    const result: AttemptCodeRunSummary = await summary(attemptId);
    expect(result.questions[0]).toMatchObject({ runCount: 2, pending: true, lastFinished: { status: "COMPLETED", outcome: "EXECUTED", passedCount: 2 } });
  });
});
