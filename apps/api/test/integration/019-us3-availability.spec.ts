import type { StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { completeAttempt, createClassWithStudents, retryAttempt, saveAnswers, startAttempt } from "../helpers/activities";
import { FixedClock, MINUTE } from "../helpers/clock";
import { asRun, createCodeExercise, createRunWorker, doubles, getLatestRun, getRun, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 019/US3 (research B8, B10, FR-014–FR-017, SC-007): the execution can be missing without breaking the
 * exercise. Two apps share the database: `on` with `CODE_RUNNER_ENABLED=true`, `off` with the kill
 * switch. Switched off, or with no live worker for the profile, the question says UNAVAILABLE and a
 * create is `409 CODE_RUNNER_UNAVAILABLE`; a pending run ends FAILED (DISABLED, EXPIRED, INTERRUPTED)
 * on the next touch and is never executed later; answering, saving, concluding, retrying, the
 * teacher's marks and the ranking of 013 keep working.
 */
describe("019/US3 execução desligada ou fora do ar não quebra o exercício", () => {
  let on: TestApp;
  let off: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let classId: string;
  let activityId: string;
  let questionId: string;

  const client = async (t: TestApp, user = student): Promise<Client> => api(t, { cookie: await loginAs(t, user) });
  const execution = async (c: Client, id = activityId) => {
    const res = await c.get(`/api/me/activities/${id}`);
    expect(res.status).toBe(200);
    return (res.body as StudentActivity).questions[0]!.execution;
  };
  const finished = () => on.prisma.auditEvent.findMany({ where: { type: "code_run.finished" }, orderBy: { id: "asc" } });

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    const base = testConfig();
    on = await createTestApp({ clock });
    off = await createTestApp({ clock, config: { codeRunner: { ...base.codeRunner, enabled: false } } });
  });
  afterAll(async () => {
    await off.close();
    await on.close();
  });

  beforeEach(async () => {
    await resetDb(on.prisma);
    clock.set(new Date());
    teacher = await createUser(on, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(on, teacher.id, { students: 1 });
    classId = created.schoolClass.id;
    student = created.students[0]!;
    const activity = await createCodeExercise(on, created.schoolClass);
    activityId = activity.activity.id;
    questionId = activity.questionIds[0]!;
    await seedHeartbeat(on, clock.now());
  });

  it("019/US3-5 019/FR-016 desligada: a questão diz UNAVAILABLE, o pedido é 409 CODE_RUNNER_UNAVAILABLE e nada é criado", async () => {
    const student = await client(off);
    expect((await startAttempt(student, activityId)).status).toBe(200);
    expect(await execution(student)).toEqual({ status: "UNAVAILABLE", languageVersion: null, convention: "STDIN_STDOUT", limits: null });
    const refused = await requestRun(student, activityId, questionId);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CODE_RUNNER_UNAVAILABLE");
    expect(await on.prisma.codeRun.count()).toBe(0);
    // `latest` still answers (nothing to show), never an error.
    expect((await getLatestRun(student, activityId, questionId)).body).toEqual({ run: null });
  });

  it("019/US3-5 019/FR-016 as enfileiradas no desligamento terminam FAILED/DISABLED no próximo toque, uma vez; o worker desligado não pega nada", async () => {
    const running = await client(on);
    expect((await startAttempt(running, activityId)).status).toBe(200);
    const created = await requestRun(running, activityId, questionId);
    expect(created.status).toBe(202);

    // The worker of a switched-off deployment claims nothing and settles the queue DISABLED.
    const sandbox = new FakeSandbox().scriptCases(doubles);
    const { worker } = createRunWorker(off, clock, { sandbox });
    expect(await worker.runOnce()).toBe(0);
    expect(sandbox.calls.prepare + sandbox.calls.runCase).toBe(0);
    const read = asRun((await getRun(await client(off), created.body.id)).body);
    expect(read).toMatchObject({ status: "FAILED", failureReason: "DISABLED", outcome: null, passedCount: null, cases: [] });
    const events = await finished();
    expect(events.map((event) => [event.actorType, (event.metadata as { failureReason: string }).failureReason])).toEqual([["SYSTEM", "DISABLED"]]);

    // Switched on again, the failed run is never executed: the student just runs again.
    const { worker: back } = createRunWorker(on, clock, { sandbox: new FakeSandbox().scriptCases(doubles) });
    expect(await back.runOnce()).toBe(0);
    expect((await requestRun(running, activityId, questionId)).status).toBe(202);
  });

  it("019/US3-5 019/FR-016 heartbeat velho (worker parado) → UNAVAILABLE; a disponibilidade é por perfil", async () => {
    const student = await client(on);
    expect((await startAttempt(student, activityId)).status).toBe(200);
    expect((await execution(student))?.status).toBe("AVAILABLE");

    // The worker stopped beating: past CODE_RUNNER_STALE_SECONDS, unavailable without touching the API.
    clock.advance(on.config.codeRunner.staleSeconds * 1000);
    expect((await execution(student))?.status).toBe("UNAVAILABLE");
    const refused = await requestRun(student, activityId, questionId);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CODE_RUNNER_UNAVAILABLE");

    // A live worker that serves only Java: the Python question stays unavailable, a Java one runs.
    await seedHeartbeat(on, clock.now(), { executions: ["java"] });
    expect((await execution(student))?.status).toBe("UNAVAILABLE");
    const java = await createCodeExercise(on, { id: classId, teacherId: teacher.id }, { languageKey: "java" });
    expect((await execution(student, java.activity.id))?.status).toBe("AVAILABLE");
    expect(await on.prisma.codeRun.count()).toBe(0);
  });

  it("019/US3-6 019/FR-017 sem worker por 60 s: FAILED/EXPIRED na leitura e nunca executada depois", async () => {
    const student = await client(on);
    expect((await startAttempt(student, activityId)).status).toBe(200);
    const created = await requestRun(student, activityId, questionId);
    expect(created.status).toBe(202);

    clock.advance(on.config.codeRunner.queueDeadlineSeconds * 1000);
    const read = asRun((await getRun(student, created.body.id)).body);
    expect(read).toMatchObject({ status: "FAILED", failureReason: "EXPIRED", cases: [] });
    expect(read.finishedAt).toBe(clock.now().toISOString());
    expect(asRun((await getLatestRun(student, activityId, questionId)).body.run)).toMatchObject({ id: created.body.id, status: "FAILED" });

    // The worker comes back: the expired run is not executed late; a new request runs.
    await seedHeartbeat(on, clock.now());
    const sandbox = new FakeSandbox().scriptCases(doubles);
    const { worker } = createRunWorker(on, clock, { sandbox });
    expect(await worker.runOnce()).toBe(0);
    expect(sandbox.calls.prepare).toBe(0);
    expect((await finished()).length).toBe(1);
    const again = await requestRun(student, activityId, questionId);
    expect(again.status).toBe(202);
    expect(await worker.runOnce()).toBe(1);
    expect(asRun((await getRun(student, again.body.id)).body)).toMatchObject({ status: "COMPLETED", passedCount: 2 });
  });

  it("019/US3-7 019/FR-017 worker caído no meio: o lease vence e a execução termina INTERRUPTED, sem casos, uma vez", async () => {
    const student = await client(on);
    expect((await startAttempt(student, activityId)).status).toBe(200);
    const created = await requestRun(student, activityId, questionId);
    // A worker claimed it and its process died: RUNNING with a lease nobody renews.
    await on.prisma.$executeRaw`
      UPDATE code_runs SET status = 'RUNNING', claimed_at = ${clock.now()}, claimed_by = 'worker-caido', claim_token = gen_random_uuid(),
             lease_until = ${new Date(clock.now().getTime() + on.config.codeRunner.worker.leaseSeconds * 1000)}
      WHERE id = ${created.body.id}::uuid`;
    expect(asRun((await getRun(student, created.body.id)).body).status).toBe("RUNNING");

    clock.advance(on.config.codeRunner.worker.leaseSeconds * 1000);
    const read = asRun((await getRun(student, created.body.id)).body);
    expect(read).toMatchObject({ status: "FAILED", failureReason: "INTERRUPTED", outcome: null, cases: [] });
    expect(await getRun(student, created.body.id).then((res) => asRun(res.body))).toEqual(read);
    expect((await finished()).map((event) => (event.metadata as { failureReason: string }).failureReason)).toEqual(["INTERRUPTED"]);
    expect(await on.prisma.codeRunCase.count()).toBe(0);
  });

  it("019/FR-014 a tela mostra os limites que o worker vivo publica no heartbeat", async () => {
    const student = await client(on);
    await seedHeartbeat(on, clock.now(), { limits: { timeMs: 3000, compileMs: 12_000, memoryMb: 512, outputBytes: 32_768 } });
    expect(await execution(student)).toEqual({
      status: "AVAILABLE",
      languageVersion: "Python 3.13",
      convention: "STDIN_STDOUT",
      limits: { timeMs: 3000, memoryMb: 512, outputBytes: 32_768 },
    });
  });

  it("019/SC-007 com a execução desligada, responder, salvar, concluir, refazer, a correção do professor e o ranking funcionam (013)", async () => {
    const learner = await client(off);
    const teacherClient = await client(off, teacher);
    expect((await startAttempt(learner, activityId)).status).toBe(200);
    const saved = await saveAnswers(learner, activityId, [{ questionId, answer: { kind: "CODE", source: "print(int(input()) * 2)" }, baseRevision: 0 }]);
    expect(saved.status).toBe(200);

    const concluded = await completeAttempt(learner, activityId, 1);
    expect(concluded.status).toBe(200);
    expect((concluded.body as StudentActivity).points).toMatchObject({ earned: 0, awaitingCorrection: true });

    const attempt = await off.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId: student.id } });
    const marked = await teacherClient.put(`/api/classes/${classId}/activities/${activityId}/attempts/${attempt.id}/marks`, {
      marks: [{ questionId, result: "CORRECT" }],
    });
    expect(marked.status, JSON.stringify(marked.body)).toBe(200);
    const ranking = (await teacherClient.get(`/api/classes/${classId}/ranking`)).body as { rows: { points: number }[] };
    expect(ranking.rows.map((row) => row.points)).toEqual([15]); // a BASIC exercise (013)

    expect((await retryAttempt(learner, activityId, 1)).status).toBe(200);
    expect(await execution(learner)).toMatchObject({ status: "UNAVAILABLE" });
    expect(await off.prisma.codeRun.count()).toBe(0);
    clock.advance(MINUTE);
    expect((await completeAttempt(learner, activityId, 2)).status).toBe(200);
  });
});
