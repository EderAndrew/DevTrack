import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import { createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createCodeExercise, createRunWorker, doubles, getLatestRun, getRun, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const CREATE_P95_MS = 150;
const READ_P95_MS = 100;
const CALLS = 40;
/** Final runs already in the table (other students' and the student's own history). */
const HISTORY = 2_000;

const p95 = (durations: number[]) => [...durations].sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1]!;

/**
 * 019 plan "Performance Goals" (API only): creating a run p95 < 150 ms and reading one (the latest
 * of a question, or by id) p95 < 100 ms, with 2 000 runs already in the table. Each call is measured
 * end to end through HTTP after a warm-up; the worker finishes each run between two creations
 * (not measured), so every creation is a new run.
 */
describe("019 desempenho das rotas de execução", () => {
  let t: TestApp;
  let clock: FixedClock;
  let client: ReturnType<typeof api>;
  let activityId: string;
  let questionId: string;
  let worker: CodeRunWorker;

  const timed = async <T extends { status: number }>(call: () => Promise<T>) => {
    const start = performance.now();
    const res = await call();
    return { res, ms: performance.now() - start };
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, codeRunsPerMinute: 10_000 } } });
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const { schoolClass, students } = await createClassWithStudents(t, teacher.id, { students: 1 });
    client = api(t, { cookie: await loginAs(t, students[0]!) });
    const activity = await createCodeExercise(t, schoolClass);
    activityId = activity.activity.id;
    questionId = activity.questionIds[0]!;
    await seedHeartbeat(t, clock.now());
    expect((await startAttempt(client, activityId)).status).toBe(200);
    ({ worker } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }) as { worker: CodeRunWorker });

    // The history: one real run, then copies of it, final (QUEUED → FAILED, as the triggers require).
    expect((await requestRun(client, activityId, questionId)).status).toBe(202);
    expect(await worker.runOnce()).toBe(1);
    const source = await t.prisma.codeRun.findFirstOrThrow();
    await t.prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
        src code_runs%ROWTYPE;
        new_id uuid;
      BEGIN
        SELECT * INTO src FROM code_runs WHERE id = '${source.id}';
        FOR i IN 1..${HISTORY} LOOP
          new_id := gen_random_uuid();
          INSERT INTO code_runs (id, activity_id, question_id, attempt_id, student_user_id, execution, source_code,
                                 public_case_count, created_at, deadline_at)
          VALUES (new_id, src.activity_id, src.question_id, src.attempt_id, src.student_user_id, src.execution,
                  'print(1)', src.public_case_count, src.created_at - (i * interval '1 second'),
                  src.deadline_at - (i * interval '1 second'));
          UPDATE code_runs SET status = 'FAILED', failure_reason = 'EXPIRED', finished_at = src.finished_at WHERE id = new_id;
        END LOOP;
      END $$`);
    await t.prisma.$executeRawUnsafe("ANALYZE code_runs");
  }, 300_000);
  afterAll(() => t.close());

  it(`criar uma execução p95 < ${CREATE_P95_MS} ms`, async () => {
    const durations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      clock.advance(1000);
      const { res, ms } = await timed(() => requestRun(client, activityId, questionId, `print(int(input()) * 2) # ${i}\n`));
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      if (i >= 0) durations.push(ms);
      expect(await worker.runOnce()).toBe(1);
    }
    expect(p95(durations)).toBeLessThan(CREATE_P95_MS);
  });

  it(`ler a execução (a última da questão e pelo id) p95 < ${READ_P95_MS} ms`, async () => {
    const latest = await getLatestRun(client, activityId, questionId);
    expect(latest.status).toBe(200);
    const runId = latest.body.run.id as string;
    expect(latest.body.run).toMatchObject({ status: "COMPLETED", passedCount: 2 });

    const latestDurations: number[] = [];
    const byIdDurations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      const a = await timed(() => getLatestRun(client, activityId, questionId));
      const b = await timed(() => getRun(client, runId));
      expect([a.res.status, b.res.status]).toEqual([200, 200]);
      if (i >= 0) {
        latestDurations.push(a.ms);
        byIdDurations.push(b.ms);
      }
    }
    expect(p95(latestDurations)).toBeLessThan(READ_P95_MS);
    expect(p95(byIdDurations)).toBeLessThan(READ_P95_MS);
  });
});
