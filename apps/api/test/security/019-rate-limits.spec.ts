import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import { createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createCodeExercise, createRunWorker, doubles, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/** Lowered for the suite: the 4th new run of a minute is refused. */
const LIMIT = 3;

/**
 * 019/FR-015, SC-005 (research B11): `RATE_LIMIT_CODE_RUNS_PER_MINUTE` new runs per student. Past it,
 * `429 RATE_LIMITED` with `Retry-After`, no run created and `code_run.rate_limited` audited (actor the
 * student, no target, only the scope). Getting the pending run back costs nothing, and one student's
 * limit never touches another's.
 */
describe("019/SC-005 limite de execuções por aluno por minuto", () => {
  let t: TestApp;
  let clock: FixedClock;
  let students: TestUser[];
  let clients: Client[];
  let activityId: string;
  let questionId: string;
  let worker: CodeRunWorker;

  const runs = (student: TestUser) => t.prisma.codeRun.count({ where: { studentUserId: student.id } });
  /** A new run, then the worker finishes it, so the next request creates another. */
  const runAndFinish = async (client: Client) => {
    const res = await requestRun(client, activityId, questionId);
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(await worker.runOnce()).toBe(1);
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    const base = testConfig();
    t = await createTestApp({ clock, config: { rateLimit: { ...base.rateLimit, codeRunsPerMinute: LIMIT } } });
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
    ({ worker } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }) as { worker: CodeRunWorker });
  });

  it("019/SC-005 019/FR-015 a (N+1)ª no minuto → 429 com Retry-After, sem execução criada, auditada", async () => {
    for (let index = 0; index < LIMIT; index += 1) await runAndFinish(clients[0]!);
    const refused = await requestRun(clients[0]!, activityId, questionId);
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
    const retryAfter = Number(refused.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(await runs(students[0]!)).toBe(LIMIT);
    // Refused again: still nothing created; each refusal is audited, without a target or content.
    expect((await requestRun(clients[0]!, activityId, questionId)).status).toBe(429);
    expect(await runs(students[0]!)).toBe(LIMIT);
    const events = await t.prisma.auditEvent.findMany({ where: { type: "code_run.rate_limited" }, orderBy: { id: "asc" } });
    expect(events.map((event) => [event.actorType, event.actorUserId, event.targetType, event.targetId, event.metadata])).toEqual([
      ["USER", students[0]!.id, null, null, { scope: "code-runs" }],
      ["USER", students[0]!.id, null, null, { scope: "code-runs" }],
    ]);
    expect(await t.prisma.auditEvent.count({ where: { type: "code_run.requested" } })).toBe(LIMIT);
  });

  it("019/FR-015 devolver a execução pendente não conta", async () => {
    const first = await requestRun(clients[0]!, activityId, questionId);
    expect(first.status).toBe(202);
    for (let index = 0; index < LIMIT + 2; index += 1) {
      const again = await requestRun(clients[0]!, activityId, questionId);
      expect(again.status).toBe(200);
      expect(again.body.id).toBe(first.body.id);
    }
    expect(await worker.runOnce()).toBe(1);
    // Only the first run counted: LIMIT − 1 more new runs still fit in the minute.
    for (let index = 1; index < LIMIT; index += 1) await runAndFinish(clients[0]!);
    expect((await requestRun(clients[0]!, activityId, questionId)).status).toBe(429);
    expect(await t.prisma.auditEvent.count({ where: { type: "code_run.rate_limited" } })).toBe(1);
  });

  it("019/SC-005 o limite de um aluno nunca afeta outro", async () => {
    for (let index = 0; index < LIMIT; index += 1) await runAndFinish(clients[0]!);
    expect((await requestRun(clients[0]!, activityId, questionId)).status).toBe(429);
    for (let index = 0; index < LIMIT; index += 1) await runAndFinish(clients[1]!);
    expect(await runs(students[1]!)).toBe(LIMIT);
  });
});
