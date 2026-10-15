import type { CodeRun, StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCase, FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import { completeAttempt, createActivity, createClassWithStudents, retryAttempt, saveAnswers, startAttempt } from "../helpers/activities";
import { FixedClock, MINUTE } from "../helpers/clock";
import {
  asRun,
  createCodeExercise,
  createRunWorker,
  DEFAULT_HEARTBEAT_LIMITS,
  doubles,
  getLatestRun,
  getRun,
  PRIVATE_RUN_MARKER,
  requestRun,
  seedHeartbeat,
} from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 019/US1 (research B6–B9, B13, B17): "Executar" creates a run of the code in the editor against the
 * question's PUBLIC cases, the worker runs it (here with the `FakeSandbox`) and the student reads the
 * result per case. One pending run per student; nothing of it touches the answer, the attempt, the
 * conclusion or the points (013).
 */
describe("019/US1 aluno executa o código contra os casos públicos", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let students: TestUser[];
  let student: Client;
  let schoolClass: { id: string; teacherId: string };
  let activityId: string;
  let questionId: string;
  let sandbox: FakeSandbox;
  let worker: CodeRunWorker;

  const view = async (client = student, id = activityId) => {
    const res = await client.get(`/api/me/activities/${id}`);
    expect(res.status).toBe(200);
    return res.body as StudentActivity;
  };
  const start = async (client = student, id = activityId) => expect((await startAttempt(client, id)).status).toBe(200);
  const run = async (sourceCode?: string, client = student) => {
    const res = await requestRun(client, activityId, questionId, sourceCode);
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    return asRun(res.body);
  };
  const read = async (runId: string, client = student) => {
    const res = await getRun(client, runId);
    expect(res.status).toBe(200);
    return asRun(res.body);
  };
  /** Moves the server clock; the worker stays alive (a fresh heartbeat), as a real one beats every 5 s. */
  const advance = async (ms: number) => {
    clock.advance(ms);
    await seedHeartbeat(t, clock.now());
  };
  /** Requests a run, lets the worker take it and returns the final result. */
  const executed = async (sourceCode?: string) => {
    const created = await run(sourceCode);
    expect(await worker.runOnce()).toBe(1);
    return read(created.id);
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 2 });
    schoolClass = created.schoolClass;
    students = created.students;
    student = api(t, { cookie: await loginAs(t, students[0]!) });
    const activity = await createCodeExercise(t, schoolClass);
    activityId = activity.activity.id;
    questionId = activity.questionIds[0]!;
    await seedHeartbeat(t, clock.now());
    ({ worker, sandbox } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }) as { worker: CodeRunWorker; sandbox: FakeSandbox });
  });

  it("019/US1-1 019/FR-005 a questão de Código de um exercício em andamento tem execução disponível, com versão, convenção e limites", async () => {
    await start();
    const question = (await view()).questions[0]!;
    expect(question.starterCode).toBe("# leia a entrada\n");
    expect(question.execution).toEqual({
      status: "AVAILABLE",
      languageVersion: "Python 3.13",
      convention: "STDIN_STDOUT",
      limits: { timeMs: DEFAULT_HEARTBEAT_LIMITS.timeMs, memoryMb: DEFAULT_HEARTBEAT_LIMITS.memoryMb, outputBytes: DEFAULT_HEARTBEAT_LIMITS.outputBytes },
    });
    // Java names its convention: the class must be Main (FR-020).
    const java = await createCodeExercise(t, schoolClass, { languageKey: "java" });
    expect((await view(student, java.activity.id)).questions[0]!.execution).toMatchObject({ status: "AVAILABLE", languageVersion: "Java 25", convention: "JAVA_MAIN_CLASS" });
  });

  it("019/US1-2 019/FR-006 019/FR-007 programa certo: QUEUED, depois cada caso público passou, na ordem, e o resumo 2 de 2", async () => {
    await start();
    const created = await run("print(int(input()) * 2)\n");
    expect(created).toMatchObject({ questionId, status: "QUEUED", publicCaseCount: 2, passedCount: null, outcome: null, failureReason: null, cases: [], finishedAt: null });
    expect(created.sourceCode).toBe("print(int(input()) * 2)\n");

    expect(await worker.runOnce()).toBe(1);
    const done = await read(created.id);
    expect(done).toMatchObject({ status: "COMPLETED", outcome: "EXECUTED", passedCount: 2, publicCaseCount: 2, compileOutput: null, contentPurged: false });
    expect(done.cases).toEqual([
      { position: 0, verdict: "PASSED", stdout: "2\n", stderr: "", durationMs: 40 },
      { position: 1, verdict: "PASSED", stdout: "6\n", stderr: "", durationMs: 40 },
    ]);
    expect(done.finishedAt).toBe(clock.now().toISOString());
    // Only the PUBLIC inputs went to the sandbox, in their order; the private case never ran.
    expect(sandbox.cases.map((call) => [call.key, call.stdin])).toEqual([
      ["python", "1\n"],
      ["python", "3\n"],
    ]);
    expect(sandbox.calls.prepare).toBe(1);
  });

  it("019/US1-3 saída diferente num caso: WRONG_OUTPUT com a saída obtida; o outro passa", async () => {
    await start();
    sandbox.scriptCases(fakeCase({ stdout: "2\n" }), fakeCase({ stdout: "7\n" }));
    const done = await executed();
    expect(done.passedCount).toBe(1);
    expect(done.cases.map((item) => [item.position, item.verdict, item.stdout])).toEqual([
      [0, "PASSED", "2\n"],
      [1, "WRONG_OUTPUT", "7\n"],
    ]);
  });

  it("019/US1-4 erro de compilação ou de sintaxe: a mensagem e nenhum caso", async () => {
    await start();
    sandbox.failCompilation('  File "/tmp/main.py", line 1\nSyntaxError: invalid syntax');
    const done = await executed("print(\n");
    expect(done).toMatchObject({ status: "COMPLETED", outcome: "COMPILATION_ERROR", passedCount: 0, cases: [] });
    expect(done.compileOutput).toContain("SyntaxError");
    expect(sandbox.calls.runCase).toBe(0);
  });

  it("019/US1-5 erro de execução: RUNTIME_ERROR com a saída de erro e a saída obtida até ali", async () => {
    await start();
    sandbox.scriptCases(fakeCase({ exitCode: 1, stdout: "parcial\n", stderr: "Traceback: ZeroDivisionError" }));
    const done = await executed();
    expect(done.cases[0]).toMatchObject({ verdict: "RUNTIME_ERROR", stdout: "parcial\n", stderr: "Traceback: ZeroDivisionError" });
    expect(done.passedCount).toBe(0);
  });

  it("019/US1-6 tempo, memória e saída excedidos têm o próprio veredito; o aluno executa de novo", async () => {
    await start();
    sandbox.scriptCases(fakeCase({ timedOut: true, exitCode: 137 }), fakeCase({ oomKilled: true, exitCode: 137 }));
    const first = await executed();
    expect(first.cases.map((item) => item.verdict)).toEqual(["TIME_LIMIT", "MEMORY_LIMIT"]);

    sandbox.scriptCases(fakeCase({ outputExceeded: true, stdout: "x".repeat(100) }), fakeCase({ stdout: "6\n" }));
    const second = await executed();
    expect(second.id).not.toBe(first.id);
    expect(second.cases.map((item) => item.verdict)).toEqual(["OUTPUT_LIMIT", "PASSED"]);
  });

  it("019/US1-7 019/FR-004 nenhuma resposta da execução traz entrada, saída esperada ou sinal dos casos privados", async () => {
    await start();
    const created = await requestRun(student, activityId, questionId);
    await worker.runOnce();
    const runResponses = [created, await getRun(student, created.body.id), await getLatestRun(student, activityId, questionId)];
    for (const res of [...runResponses, await student.get(`/api/me/activities/${activityId}`)]) {
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(PRIVATE_RUN_MARKER);
      expect(body).not.toMatch(/"visibility"|PRIVATE|privateCase|testCaseCount|"testCases"/);
    }
    // A run carries no case input or expected output at all: the screen joins it with `publicTestCases`.
    for (const res of runResponses) expect(JSON.stringify(res.body)).not.toMatch(/"input"|"expectedOutput"|testCaseId|claim|lease|worker/i);
    expect((await read(created.body.id)).publicCaseCount).toBe(2);
  });

  it("019/US1-8 019/FR-008 executar não muda a resposta salva, a tentativa, a conclusão nem os pontos (013)", async () => {
    await start();
    const saved = await saveAnswers(student, activityId, [{ questionId, answer: { kind: "CODE", source: "resposta salva" }, baseRevision: 0 }]);
    expect(saved.status).toBe(200);
    const before = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId: students[0]!.id } });
    const answerBefore = await t.prisma.activityAnswer.findFirstOrThrow({ where: { attemptId: before.id } });

    await advance(MINUTE);
    await executed("outro código");
    const after = await t.prisma.activityAttempt.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual(before);
    expect(await t.prisma.activityAnswer.findFirstOrThrow({ where: { attemptId: before.id } })).toEqual(answerBefore);
    expect(await t.prisma.exerciseQuestionResult.count()).toBe(0);

    const concluded = await completeAttempt(student, activityId, 1);
    expect(concluded.status).toBe(200);
    const result = await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId: before.id } });
    expect(result).toMatchObject({ result: "PENDING_TEACHER", points: 0, scoring: true });
    expect((concluded.body as StudentActivity).points).toMatchObject({ earned: 0, awaitingCorrection: true });
  });

  it("019/US1-9 019/FR-009 clique duplo e duas abas: uma só execução pendente por aluno, devolvida com 200", async () => {
    await start();
    const first = await run();
    const again = await requestRun(student, activityId, questionId, "outro código");
    expect(again.status).toBe(200);
    expect(asRun(again.body)).toMatchObject({ id: first.id, sourceCode: first.sourceCode });

    // Two tabs at once, after the first run ends: one new run, the other tab gets it back.
    await worker.runOnce();
    const both = await Promise.all([requestRun(student, activityId, questionId), requestRun(student, activityId, questionId)]);
    expect(both.map((res) => res.status).sort()).toEqual([200, 202]);
    expect(new Set(both.map((res) => res.body.id)).size).toBe(1);
    expect(await t.prisma.codeRun.count({ where: { studentUserId: students[0]!.id } })).toBe(2);

    // A pending run of another question comes back as is: the screen tells it apart by `questionId`.
    const other = await createActivity(t, schoolClass, { type: "EXERCISE", questions: [{ type: "CODE", languageKey: "python", testCases: [{ input: "", expectedOutput: "ok", visibility: "PUBLIC" }] }] });
    await start(student, other.activity.id);
    const elsewhere = await requestRun(student, other.activity.id, other.questionIds[0]!);
    expect(elsewhere.status).toBe(200);
    expect(asRun(elsewhere.body).questionId).toBe(questionId);
  });

  it("019/US1-10 o código da execução volta como foi enviado, para a tela comparar com o editor", async () => {
    await start();
    const source = "n = int(input())\r\nprint(n * 2)  # dobro ç\n";
    const done = await executed(source);
    expect(done.sourceCode).toBe(source);
  });

  it("019/FR-010 latest: a última execução da questão na tentativa atual; outra questão e a tentativa seguinte começam vazias", async () => {
    const two = await createActivity(t, schoolClass, {
      type: "EXERCISE",
      questions: [
        { type: "CODE", languageKey: "python", testCases: [{ input: "1", expectedOutput: "2", visibility: "PUBLIC" }] },
        { type: "CODE", languageKey: "javascript", testCases: [{ input: "1", expectedOutput: "2", visibility: "PUBLIC" }] },
      ],
    });
    activityId = two.activity.id;
    questionId = two.questionIds[0]!;
    expect((await getLatestRun(student, activityId, questionId)).body).toEqual({ run: null });
    await start();
    const firstRun = await executed();
    await advance(MINUTE);
    const secondRun = await executed();
    expect(asRun((await getLatestRun(student, activityId, questionId)).body.run)).toMatchObject({ id: secondRun.id });
    expect(secondRun.id).not.toBe(firstRun.id);
    expect((await getLatestRun(student, activityId, two.questionIds[1]!)).body).toEqual({ run: null });

    // "Refazer": a new attempt, whose latest is empty; running there works again.
    expect((await completeAttempt(student, activityId, 1)).status).toBe(200);
    expect((await getLatestRun(student, activityId, questionId)).body).toEqual({ run: null });
    expect((await retryAttempt(student, activityId, 1)).status).toBe(200);
    expect((await getLatestRun(student, activityId, questionId)).body).toEqual({ run: null });
    const afterRetry = await run();
    expect(asRun((await getLatestRun(student, activityId, questionId)).body.run).id).toBe(afterRetry.id);
  });

  it("019/FR-005 tentativa não iniciada ou concluída → 409 ATTEMPT_NOT_IN_PROGRESS; 'Refazer' volta a executar", async () => {
    const notStarted = await requestRun(student, activityId, questionId);
    expect(notStarted.status).toBe(409);
    expect(notStarted.body.code).toBe("ATTEMPT_NOT_IN_PROGRESS");
    await start();
    expect((await completeAttempt(student, activityId, 1)).status).toBe(200);
    const concluded = await requestRun(student, activityId, questionId);
    expect(concluded.status).toBe(409);
    expect(concluded.body.code).toBe("ATTEMPT_NOT_IN_PROGRESS");
    expect((await retryAttempt(student, activityId, 1)).status).toBe(200);
    expect((await requestRun(student, activityId, questionId)).status).toBe(202);
    expect(await t.prisma.codeRun.count()).toBe(1);
  });

  it("019/FR-005 Trabalho e Prova não executam (404), nem questão que não é de Código", async () => {
    const work = await createActivity(t, schoolClass, { type: "ASSIGNMENT", questions: [{ type: "CODE", languageKey: "python", testCases: [{ input: "1", expectedOutput: "2", visibility: "PUBLIC" }] }] });
    await start(student, work.activity.id);
    expect((await requestRun(student, work.activity.id, work.questionIds[0]!)).status).toBe(404);
    expect((await view(student, work.activity.id)).questions[0]!.execution).toBeNull();

    const exam = await createActivity(t, schoolClass, { type: "EXAM", questions: [{ type: "CODE", languageKey: "python", testCases: [{ input: "1", expectedOutput: "2", visibility: "PUBLIC" }] }] });
    expect((await requestRun(student, exam.activity.id, exam.questionIds[0]!)).status).toBe(404);

    const choice = await createActivity(t, schoolClass, { type: "EXERCISE", questions: [{ type: "MULTIPLE_CHOICE" }] });
    await start(student, choice.activity.id);
    expect((await requestRun(student, choice.activity.id, choice.questionIds[0]!)).status).toBe(404);
    expect((await view(student, choice.activity.id)).questions[0]!.execution).toBeNull();
    expect(await t.prisma.codeRun.count()).toBe(0);
  });

  it("019/FR-005 atividade encerrada ou cancelada → 404, sem execução criada", async () => {
    for (const status of ["CLOSED", "CANCELLED"] as const) {
      const activity = await createCodeExercise(t, schoolClass);
      await start(student, activity.activity.id);
      await t.prisma.classActivity.update({
        where: { id: activity.activity.id },
        data: { status, ...(status === "CLOSED" ? { closedAt: clock.now() } : { cancelledAt: clock.now() }) },
      });
      expect((await requestRun(student, activity.activity.id, activity.questionIds[0]!)).status, status).toBe(404);
    }
    expect(await t.prisma.codeRun.count()).toBe(0);
  });

  it("019/FR-009 código vazio: aceito (202) e, no ciclo, os casos com o veredito do programa vazio, sem chamar o sandbox", async () => {
    await start();
    const done = await executed("");
    expect(done).toMatchObject({ status: "COMPLETED", outcome: "EXECUTED", passedCount: 0, sourceCode: "" });
    expect(done.cases.map((item) => [item.verdict, item.stdout])).toEqual([
      ["WRONG_OUTPUT", ""],
      ["WRONG_OUTPUT", ""],
    ]);
    expect(sandbox.calls.prepare + sandbox.calls.runCase).toBe(0);
  });

  it("019/FR-007 auditoria: code_run.requested e code_run.finished só com ids, enums, contagens e tempos", async () => {
    await start();
    const source = "print(int(input()) * 2) # MARCADOR-CODIGO-019 ç\n";
    const done = await executed(source);
    const events = await t.prisma.auditEvent.findMany({ where: { type: { startsWith: "code_run." } }, orderBy: { id: "asc" } });
    expect(events.map((event) => [event.type, event.actorType, event.targetType, event.targetId])).toEqual([
      ["code_run.requested", "USER", "CODE_RUN", done.id],
      ["code_run.finished", "SYSTEM", "CODE_RUN", done.id],
    ]);
    expect(events[0]!.metadata).toEqual({ activityId, questionId, execution: "python", publicCaseCount: 2, sourceBytes: Buffer.byteLength(source) });
    expect(events[1]!.metadata).toMatchObject({ status: "COMPLETED", outcome: "EXECUTED", failureReason: null, passedCount: 2, publicCaseCount: 2 });
    expect((events[1]!.metadata as { verdicts: Record<string, number> }).verdicts).toMatchObject({ PASSED: 2, WRONG_OUTPUT: 0 });
    expect(JSON.stringify(events.map((event) => event.metadata))).not.toMatch(/MARCADOR|print|stdout/);
  });

  it("019/FR-009 a leitura de uma execução de outro aluno é 404; a execução que voltou nunca é de outro aluno", async () => {
    await start();
    const mine = await run();
    const classmate = api(t, { cookie: await loginAs(t, students[1]!) });
    expect((await getRun(classmate, mine.id)).status).toBe(404);
    await start(classmate);
    const theirs = await requestRun(classmate, activityId, questionId);
    expect(theirs.status).toBe(202);
    expect(theirs.body.id).not.toBe(mine.id);
    const read2: CodeRun = asRun((await getRun(student, mine.id)).body);
    expect(read2.id).toBe(mine.id);
  });
});
