import type { Answer, StudentActivity, TeacherAttempt } from "@repo/contracts";
import { TeacherAttemptSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCase, FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { RateLimitService } from "../../src/platform/rate-limit/rate-limit.service";
import {
  createActivity,
  type CreatedActivity,
  createClassWithStudents,
  getAttempt,
  gradeAttempt,
  releaseResult,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "../helpers/activities";
import { FixedClock, MINUTE } from "../helpers/clock";
import { asRun, createCodeExercise, createCodeWork, createRunWorker, DEFAULT_HEARTBEAT_LIMITS, doubles, getLatestRun, getRun, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 021/US1 (research Y4, Y9): on a work applied with "Permitir executar o código", the CODE questions
 * with PUBLIC cases in a language with execution run exactly as on an exercise (019): the student view's
 * `execution`, the run routes, the worker's verdicts. A work without the option, and an exam, never
 * run (404, no row). A run never touches the saved answer, the submission, the grading or the release
 * (012), and on a CONTROLLED work it records no integrity event (015).
 */
describe("021/US1 aluno executa numa questão de Código do Trabalho", () => {
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

  const view = async (id = activityId) => {
    const res = await student.get(`/api/me/activities/${id}`);
    expect(res.status).toBe(200);
    return res.body as StudentActivity;
  };
  const start = async (id = activityId) => expect((await startAttempt(student, id)).status).toBe(200);
  const run = async (sourceCode?: string, id = activityId, question = questionId) => {
    const res = await requestRun(student, id, question, sourceCode);
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    return asRun(res.body);
  };
  const executed = async (sourceCode?: string) => {
    const created = await run(sourceCode);
    expect(await worker.runOnce()).toBe(1);
    const res = await getRun(student, created.id);
    expect(res.status).toBe(200);
    return asRun(res.body);
  };
  /** Moves the server clock; the worker stays alive (a fresh heartbeat). */
  const advance = async (ms: number) => {
    clock.advance(ms);
    await seedHeartbeat(t, clock.now());
  };
  const code = (source: string): Answer => ({ kind: "CODE", source });
  const choice = (alternativeId: string): Answer => ({ kind: "ALTERNATIVE", alternativeId });

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

  it("021/US1-1 a questão de Código do trabalho com a opção tem execução disponível, com versão, convenção e limites; sem casos públicos ou sem execução, como na 019", async () => {
    await start();
    const [codeQuestion, choiceQuestion] = (await view()).questions;
    expect(codeQuestion!.execution).toEqual({
      status: "AVAILABLE",
      languageVersion: "Python 3.13",
      convention: "STDIN_STDOUT",
      limits: { timeMs: DEFAULT_HEARTBEAT_LIMITS.timeMs, memoryMb: DEFAULT_HEARTBEAT_LIMITS.memoryMb, outputBytes: DEFAULT_HEARTBEAT_LIMITS.outputBytes },
    });
    expect(choiceQuestion!.execution).toBeNull();

    // The option on a work whose CODE question can't run: the 019 reasons, not a missing panel.
    const privateOnly = await createCodeWork(t, schoolClass, { testCases: [{ input: "1\n", expectedOutput: "2\n", visibility: "PRIVATE" }] });
    expect((await view(privateOnly.activity.id)).questions[0]!.execution).toMatchObject({ status: "NO_PUBLIC_CASES" });
    const cpp = await createCodeWork(t, schoolClass, { languageKey: "cpp" });
    expect((await view(cpp.activity.id)).questions[0]!.execution).toMatchObject({ status: "NOT_SUPPORTED" });
  });

  it("021/US1-2 programa certo 2 de 2, saída diferente, erro de compilação e tempo esgotado, pelo worker", async () => {
    await start();
    const right = await executed("print(int(input()) * 2)\n");
    expect(right).toMatchObject({ status: "COMPLETED", outcome: "EXECUTED", passedCount: 2, publicCaseCount: 2 });
    expect(right.cases.map((item) => item.verdict)).toEqual(["PASSED", "PASSED"]);
    // Only the PUBLIC inputs went to the sandbox; the private case never ran.
    expect(sandbox.cases.map((call) => call.stdin)).toEqual(["1\n", "3\n"]);

    await advance(MINUTE);
    sandbox.scriptCases(fakeCase({ stdout: "2\n" }), fakeCase({ stdout: "7\n" }));
    const wrong = await executed("print(2)\n");
    expect(wrong.passedCount).toBe(1);
    expect(wrong.cases.map((item) => [item.verdict, item.stdout])).toEqual([
      ["PASSED", "2\n"],
      ["WRONG_OUTPUT", "7\n"],
    ]);

    await advance(MINUTE);
    sandbox.failCompilation("SyntaxError: invalid syntax");
    const broken = await executed("print(\n");
    expect(broken).toMatchObject({ status: "COMPLETED", outcome: "COMPILATION_ERROR", passedCount: 0, cases: [] });
    expect(broken.compileOutput).toContain("SyntaxError");

    await advance(MINUTE);
    sandbox.failCompilation(null).scriptCases(fakeCase({ timedOut: true, exitCode: 137 }));
    const looping = await executed("while True: pass\n");
    expect(looping.cases.map((item) => item.verdict)).toEqual(["TIME_LIMIT", "TIME_LIMIT"]);
    expect(asRun((await getLatestRun(student, activityId, questionId)).body.run).id).toBe(looping.id);
  });

  it("021/US1-4 021/FR-008 com execuções feitas, a entrega leva a resposta salva; correção, nota e liberação seguem a 012", async () => {
    await start();
    const saved = await saveAnswers(student, activityId, [
      { questionId, answer: code("resposta salva"), baseRevision: 0 },
      { questionId: work.questionIds[1]!, answer: choice(work.correctAlternativeIds[1]!), baseRevision: 0 },
    ]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const attemptBefore = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId: students[0]!.id } });

    await advance(MINUTE);
    await executed("código da execução");
    await advance(MINUTE);
    await executed("outro código da execução");
    expect(await t.prisma.activityAttempt.findUniqueOrThrow({ where: { id: attemptBefore.id } })).toEqual(attemptBefore);

    const submitted = await submitAttempt(student, activityId);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    const res = await getAttempt(teacherClient, schoolClass.id, activityId, attemptBefore.id);
    expect(res.status).toBe(200);
    const review: TeacherAttempt = TeacherAttemptSchema.parse(res.body);
    expect(review.status).toBe("SUBMITTED");
    expect(review.answers.find((answer) => answer.questionId === questionId)!.answer).toEqual(code("resposta salva"));
    // The CODE question waits for the teacher (no grading by the runner); the multiple choice is the rule's.
    const gradings = review.submission!.gradings;
    expect(gradings.find((grading) => grading.questionId === questionId)).toMatchObject({ status: "PENDING_TEACHER", finalGrade: null });
    expect(gradings.find((grading) => grading.questionId === work.questionIds[1])).toMatchObject({ status: "GRADED", nature: "RULE_RESULT" });

    const graded = await gradeAttempt(teacherClient, schoolClass.id, activityId, attemptBefore.id, {
      version: review.submission!.version,
      decisions: [{ questionId, grade: "0.00" }],
    });
    expect(graded.status, JSON.stringify(graded.body)).toBe(200);
    expect((await releaseResult(teacherClient, schoolClass.id, activityId)).status).toBe(200);
    const released = await view();
    expect(released.result).not.toBeNull();
    expect(released.result!.grade).toBe(review.submission!.grade);
  });

  it("021/US1-5 021/FR-007 trabalho sem a opção: nenhuma execução nas questões de Código e o pedido forjado é 404 sem linha; Prova → 404", async () => {
    const without = await createCodeWork(t, schoolClass, { codeExecutionAllowed: false });
    await start(without.activity.id);
    expect((await view(without.activity.id)).questions.map((question) => question.execution)).toEqual([null, null]);
    for (const res of [await requestRun(student, without.activity.id, without.questionIds[0]!), await getLatestRun(student, without.activity.id, without.questionIds[0]!)]) {
      expect(res.status).toBe(404);
    }

    const exam = await createActivity(t, schoolClass, { type: "EXAM", questions: [{ type: "CODE", languageKey: "python", testCases: [{ input: "1", expectedOutput: "2", visibility: "PUBLIC" }] }] });
    expect((await requestRun(student, exam.activity.id, exam.questionIds[0]!)).status).toBe(404);
    // The multiple-choice question of a work with the option is not runnable either.
    await start();
    expect((await requestRun(student, activityId, work.questionIds[1]!)).status).toBe(404);
    expect(await t.prisma.codeRun.count()).toBe(0);
  });

  it("021/US1-6 021/FR-009 trabalho CONTROLADO com a opção: a execução é aceita e não cria evento do modo controlado", async () => {
    const controlled = await createCodeWork(t, schoolClass, { executionMode: "CONTROLLED" });
    activityId = controlled.activity.id;
    questionId = controlled.questionIds[0]!;
    await start();
    expect((await view()).questions[0]!.execution).toMatchObject({ status: "AVAILABLE" });
    const done = await executed();
    expect(done).toMatchObject({ status: "COMPLETED", passedCount: 2 });
    expect(await t.prisma.attemptIntegrityEvent.count()).toBe(0);
  });

  it("021/FR-010 uma execução pendente num Exercício volta no pedido do Trabalho; o limite por minuto conta as duas atividades", async () => {
    const exercise = await createCodeExercise(t, schoolClass);
    await start(exercise.activity.id);
    await start();
    const pending = await run(undefined, exercise.activity.id, exercise.questionIds[0]!);
    const again = await requestRun(student, activityId, questionId, "outro código");
    expect(again.status).toBe(200);
    expect(asRun(again.body)).toMatchObject({ id: pending.id, questionId: exercise.questionIds[0] });
    expect(await worker.runOnce()).toBe(1);

    // The exercise's run took one of the minute's slots; fill the rest, then the work's run is the one over.
    const limit = t.config.rateLimit.codeRunsPerMinute;
    await t.get(RateLimitService).hit("code-runs", students[0]!.id, { limit, windowSec: 60, weight: limit - 1 });
    const over = await requestRun(student, activityId, questionId);
    expect(over.status).toBe(429);
    expect(await t.prisma.codeRun.count()).toBe(1);
  });

  it("021/FR-010 auditoria: code_run.requested com activityType ASSIGNMENT (e EXERCISE no exercício), só ids, enums e contagens", async () => {
    await start();
    const source = "print(int(input()) * 2) # MARCADOR-CODIGO-021\n";
    const done = await executed(source);
    const exercise = await createCodeExercise(t, schoolClass);
    await start(exercise.activity.id);
    await advance(MINUTE);
    await run(undefined, exercise.activity.id, exercise.questionIds[0]!);
    const requested = await t.prisma.auditEvent.findMany({ where: { type: "code_run.requested" }, orderBy: { id: "asc" } });
    expect(requested.map((event) => event.metadata)).toEqual([
      { activityId, activityType: "ASSIGNMENT", questionId, execution: "python", publicCaseCount: 2, sourceBytes: Buffer.byteLength(source) },
      expect.objectContaining({ activityId: exercise.activity.id, activityType: "EXERCISE" }),
    ]);
    expect(requested[0]!.targetId).toBe(done.id);
    expect(JSON.stringify(requested.map((event) => event.metadata))).not.toMatch(/MARCADOR|print/);
  });
});
