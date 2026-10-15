import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCase, FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createCodeExercise, createRunWorker, doubles, HeldSandbox, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 019 research B8, B10, FR-017: the queue is a table. Several workers never take the same run
 * (`FOR UPDATE SKIP LOCKED`); the result is written once, by the claim's token; a worker whose lease
 * was taken writes nothing; a sandbox failure is `SANDBOX_ERROR`; every cycle refreshes the heartbeat
 * with the profiles and the limits; `code_run.finished` exactly once per run.
 */
describe("019 worker do Code Runner: claim, lease, resultado único e heartbeat", () => {
  let t: TestApp;
  let clock: FixedClock;
  let students: TestUser[];
  let clients: Client[];
  let activityId: string;
  let questionId: string;

  const finished = () => t.prisma.auditEvent.findMany({ where: { type: "code_run.finished" }, orderBy: { id: "asc" } });

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 2 });
    students = created.students;
    clients = await Promise.all(students.map(async (student) => api(t, { cookie: await loginAs(t, student) })));
    const activity = await createCodeExercise(t, created.schoolClass);
    activityId = activity.activity.id;
    questionId = activity.questionIds[0]!;
    await seedHeartbeat(t, clock.now());
    for (const client of clients) expect((await startAttempt(client, activityId)).status).toBe(200);
  });

  it("019/FR-017 dois workers ao mesmo tempo: cada um pega uma execução (FOR UPDATE SKIP LOCKED)", async () => {
    const runs = await Promise.all(clients.map((client) => requestRun(client, activityId, questionId)));
    expect(runs.map((res) => res.status)).toEqual([202, 202]);
    const a = createRunWorker(t, clock, { workerId: "worker-a", sandbox: new FakeSandbox().scriptCases(doubles) });
    const b = createRunWorker(t, clock, { workerId: "worker-b", sandbox: new FakeSandbox().scriptCases(doubles) });
    expect(await Promise.all([a.worker.runOnce(), b.worker.runOnce()])).toEqual([1, 1]);
    const rows = await t.prisma.codeRun.findMany({ select: { status: true, claimedBy: true } });
    expect(rows.map((row) => row.status)).toEqual(["COMPLETED", "COMPLETED"]);
    expect(rows.map((row) => row.claimedBy).sort()).toEqual(["worker-a", "worker-b"]);
    expect(await a.worker.runOnce()).toBe(0);
    expect((await finished()).length).toBe(2);
  });

  it("019/FR-017 o resultado é gravado pelo claim_token: um worker atrasado, depois do lease tomado, não grava nada", async () => {
    const created = await requestRun(clients[0]!, activityId, questionId);
    const held = new HeldSandbox().scriptCases(doubles);
    const slow = createRunWorker(t, clock, { workerId: "worker-lento", sandbox: held });
    const slowCycle = slow.worker.runOnce();
    await held.started;

    // The lease passes while the slow worker is stuck: the next touch settles it INTERRUPTED.
    clock.advance(t.config.codeRunner.worker.leaseSeconds * 1000 + 1000);
    const fresh = createRunWorker(t, clock, { workerId: "worker-novo", sandbox: new FakeSandbox().scriptCases(doubles) });
    expect(await fresh.worker.runOnce()).toBe(0);
    const settled = await t.prisma.codeRun.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(settled).toMatchObject({ status: "FAILED", failureReason: "INTERRUPTED", claimedBy: "worker-lento" });

    held.release();
    await slowCycle;
    expect(await t.prisma.codeRun.findUniqueOrThrow({ where: { id: created.body.id } })).toEqual(settled);
    expect(await t.prisma.codeRunCase.count()).toBe(0);
    const events = await finished();
    expect(events.map((event) => [event.actorType, (event.metadata as { failureReason: string }).failureReason])).toEqual([["SYSTEM", "INTERRUPTED"]]);
  });

  it("019/FR-017 uma execução expirada na fila nunca é executada depois (EXPIRED, sem chamar o sandbox)", async () => {
    const created = await requestRun(clients[0]!, activityId, questionId);
    clock.advance(t.config.codeRunner.queueDeadlineSeconds * 1000);
    const { worker, sandbox } = createRunWorker(t, clock);
    expect(await worker.runOnce()).toBe(0);
    expect(await t.prisma.codeRun.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({ status: "FAILED", failureReason: "EXPIRED", claimedAt: null });
    expect((sandbox as FakeSandbox).calls.prepare).toBe(0);
    expect((await finished()).length).toBe(1);
  });

  it("019/FR-017 o sandbox lança (daemon fora): FAILED/SANDBOX_ERROR, sem casos, e o aluno pode tentar de novo", async () => {
    const created = await requestRun(clients[0]!, activityId, questionId);
    // The daemon answered the last heartbeat and died before the run (the next beat is 5 s away).
    const sandbox = new FakeSandbox();
    const { worker, heartbeat } = createRunWorker(t, clock, { sandbox });
    await heartbeat.beat(clock.now());
    sandbox.failDaemon();
    expect(await worker.runOnce()).toBe(1);
    expect(await t.prisma.codeRun.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({
      status: "FAILED",
      failureReason: "SANDBOX_ERROR",
      outcome: null,
      passedCount: null,
    });
    const [event] = await finished();
    expect(event!.metadata).toMatchObject({ status: "FAILED", failureReason: "SANDBOX_ERROR", outcome: null, passedCount: null });
    expect((await requestRun(clients[0]!, activityId, questionId)).status).toBe(202);
  });

  it("019/FR-014 heartbeat a cada ciclo: perfis com a versão e os limites do worker", async () => {
    await t.prisma.codeRunnerHeartbeat.deleteMany();
    const sandbox = new FakeSandbox();
    sandbox.available = ["python", "javascript"];
    const { worker } = createRunWorker(t, clock, { workerId: "worker-batida", sandbox });
    await worker.runOnce();
    const row = await t.prisma.codeRunnerHeartbeat.findUniqueOrThrow({ where: { workerId: "worker-batida" } });
    expect(row.lastSeenAt).toEqual(clock.now());
    expect(row.executions).toEqual([
      { key: "python", version: "Python 3.13" },
      { key: "javascript", version: "Node.js 24" },
    ]);
    const limits = t.config.codeRunner.worker;
    expect(row.limits).toEqual({ timeMs: limits.timeLimitMs, compileMs: limits.compileLimitMs, memoryMb: limits.memoryMb, outputBytes: limits.outputLimitBytes });

    clock.advance(MINUTE);
    await worker.runOnce();
    expect((await t.prisma.codeRunnerHeartbeat.findUniqueOrThrow({ where: { workerId: "worker-batida" } })).lastSeenAt).toEqual(clock.now());
    // The daemon down: the worker says it serves nothing, so the screens show the execution unavailable.
    sandbox.failDaemon();
    clock.advance(MINUTE);
    await worker.runOnce();
    expect((await t.prisma.codeRunnerHeartbeat.findUniqueOrThrow({ where: { workerId: "worker-batida" } })).executions).toEqual([]);
  });

  it("019/FR-017 o worker só pega execuções dos perfis que serve", async () => {
    const created = await requestRun(clients[0]!, activityId, questionId);
    const sandbox = new FakeSandbox();
    sandbox.available = ["java"];
    const { worker } = createRunWorker(t, clock, { sandbox });
    expect(await worker.runOnce()).toBe(0);
    expect((await t.prisma.codeRun.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe("QUEUED");
  });

  it("019/FR-017 code_run.finished exatamente uma vez por execução, com o tempo e a contagem por veredito", async () => {
    const first = await requestRun(clients[0]!, activityId, questionId);
    clock.advance(1000);
    expect((await requestRun(clients[1]!, activityId, questionId)).status).toBe(202);
    const { worker } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(fakeCase({ stdout: "2\n" }), fakeCase({ exitCode: 1 })) });
    clock.advance(3000);
    while ((await worker.runOnce()) > 0);
    const events = await finished();
    expect(events.length).toBe(2);
    expect(new Set(events.map((event) => event.targetId)).size).toBe(2);
    // The oldest run is claimed first: the first student's, 4 s after it was requested.
    expect(events[0]!.targetId).toBe(first.body.id);
    expect(events[0]!.metadata).toMatchObject({ status: "COMPLETED", outcome: "EXECUTED", passedCount: 1, publicCaseCount: 2, durationMs: 4000 });
    expect((events[0]!.metadata as { verdicts: Record<string, number> }).verdicts).toEqual({
      PASSED: 1,
      WRONG_OUTPUT: 0,
      RUNTIME_ERROR: 1,
      TIME_LIMIT: 0,
      MEMORY_LIMIT: 0,
      OUTPUT_LIMIT: 0,
    });
    // A second worker finds nothing left and writes nothing.
    expect(await createRunWorker(t, clock).worker.runOnce()).toBe(0);
    expect((await finished()).length).toBe(2);
  });
});
