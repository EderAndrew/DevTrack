import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { asRun, createCodeExercise, createRunWorker, doubles, getLatestRun, getRun, HeldSandbox, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 019 research B8, B9, FR-009, FR-017 under concurrency: one pending run per student whatever the
 * number of simultaneous requests; the API and the worker settling the same stale run close it once
 * (one `code_run.finished`); a worker's result racing the lease's expiry leaves one final state.
 */
describe("019 concorrência da execução de código", () => {
  let t: TestApp;
  let clock: FixedClock;
  let student: TestUser;
  let client: Client;
  let activityId: string;
  let questionId: string;

  const finished = () => t.prisma.auditEvent.findMany({ where: { type: "code_run.finished" } });

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
    student = created.students[0]!;
    client = api(t, { cookie: await loginAs(t, student) });
    const activity = await createCodeExercise(t, created.schoolClass);
    activityId = activity.activity.id;
    questionId = activity.questionIds[0]!;
    await seedHeartbeat(t, clock.now());
    expect((await startAttempt(client, activityId)).status).toBe(200);
  });

  it("019/FR-009 10 pedidos simultâneos do mesmo aluno → uma execução, um code_run.requested", async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => requestRun(client, activityId, questionId, `print(${index})`)));
    expect(responses.map((res) => res.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 202]);
    expect(new Set(responses.map((res) => res.body.id)).size).toBe(1);
    expect(await t.prisma.codeRun.count()).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "code_run.requested" } })).toBe(1);
  });

  it("019/FR-017 acerto de velhas pela API e pelo worker ao mesmo tempo → um só code_run.finished", async () => {
    const created = await requestRun(client, activityId, questionId);
    expect(created.status).toBe(202);
    clock.advance(t.config.codeRunner.queueDeadlineSeconds * 1000);
    const workers = ["worker-a", "worker-b"].map((workerId) => createRunWorker(t, clock, { workerId, sandbox: new FakeSandbox().scriptCases(doubles) }).worker);
    const [read, latest, ...cycles] = await Promise.all([
      getRun(client, created.body.id),
      getLatestRun(client, activityId, questionId),
      ...workers.map((worker) => worker.runOnce()),
    ]);
    expect(cycles).toEqual([0, 0]);
    expect(asRun(read!.body)).toMatchObject({ status: "FAILED", failureReason: "EXPIRED" });
    expect(asRun(latest!.body.run)).toMatchObject({ status: "FAILED", failureReason: "EXPIRED" });
    expect((await finished()).length).toBe(1);
  });

  it("019/FR-017 resultado do worker × vencimento do lease → um estado final e um code_run.finished", async () => {
    const created = await requestRun(client, activityId, questionId);
    const held = new HeldSandbox().scriptCases(doubles);
    const slow = createRunWorker(t, clock, { workerId: "worker-lento", sandbox: held });
    const cycle = slow.worker.runOnce();
    await held.started;

    clock.advance(t.config.codeRunner.worker.leaseSeconds * 1000);
    held.release();
    const [, read] = await Promise.all([cycle, getRun(client, created.body.id)]);
    const final = await t.prisma.codeRun.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(["COMPLETED", "FAILED"]).toContain(final.status);
    expect(["COMPLETED", "FAILED"]).toContain(asRun(read.body).status);
    const events = await finished();
    expect(events).toHaveLength(1);
    expect((events[0]!.metadata as { status: string }).status).toBe(final.status);
    // The cases exist only when the worker's result won.
    expect(await t.prisma.codeRunCase.count()).toBe(final.status === "COMPLETED" ? 2 : 0);
  });
});
