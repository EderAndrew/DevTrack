import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import { createActivity, createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createRunWorker, DOUBLE_CASES, doubles, getAttemptCodeRuns, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const CREATE_P95_MS = 150;
const SUMMARY_P95_MS = 150;
const CALLS = 40;
const QUESTIONS = 10;
/** Final runs of the student spread over the work's CODE questions before the summary is read. */
const RUNS = 200;

const p95 = (durations: number[]) => [...durations].sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1]!;

/**
 * 021/SC-001 (the API part; the program's own time is the 019 `test:sandbox`, plan "Performance Goals"):
 * creating a run on a work's CODE question p95 < 150 ms, and the teacher's summary of an attempt with 10
 * CODE questions and 200 runs p95 < 150 ms. Each call is measured end to end through HTTP after a warm-up;
 * the worker finishes each run between two creations (not measured).
 */
describe("021/SC-001 desempenho da execução num Trabalho e do resumo do professor", () => {
  let t: TestApp;
  let clock: FixedClock;
  let student: ReturnType<typeof api>;
  let teacher: ReturnType<typeof api>;
  let classId: string;
  let activityId: string;
  let attemptId: string;
  let questionIds: string[];
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
    const teacherUser = await createUser(t, { roles: ["TEACHER"] });
    teacher = api(t, { cookie: await loginAs(t, teacherUser) });
    const { schoolClass, students } = await createClassWithStudents(t, teacherUser.id, { students: 1 });
    classId = schoolClass.id;
    student = api(t, { cookie: await loginAs(t, students[0]!) });
    const work = await createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      codeExecutionAllowed: true,
      questions: Array.from({ length: QUESTIONS }, () => ({ type: "CODE" as const, languageKey: "python", testCases: DOUBLE_CASES })),
    });
    activityId = work.activity.id;
    questionIds = work.questionIds;
    await seedHeartbeat(t, clock.now());
    expect((await startAttempt(student, activityId)).status).toBe(200);
    attemptId = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId } })).id;
    ({ worker } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }) as { worker: CodeRunWorker });
  }, 300_000);
  afterAll(() => t.close());

  it(`021/SC-001 criar uma execução num Trabalho p95 < ${CREATE_P95_MS} ms`, async () => {
    const durations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      clock.advance(1000);
      await seedHeartbeat(t, clock.now());
      const questionId = questionIds[(i + 3) % QUESTIONS]!;
      const { res, ms } = await timed(() => requestRun(student, activityId, questionId, `print(int(input()) * 2) # ${i}\n`));
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      if (i >= 0) durations.push(ms);
      expect(await worker.runOnce()).toBe(1);
    }
    expect(p95(durations)).toBeLessThan(CREATE_P95_MS);
  });

  it(`021/SC-001 resumo de ${QUESTIONS} questões e ${RUNS} execuções p95 < ${SUMMARY_P95_MS} ms`, async () => {
    // Copies of the runs above (final: QUEUED → FAILED, as the triggers require) up to RUNS, over every question.
    const existing = await t.prisma.codeRun.count({ where: { attemptId } });
    const source = await t.prisma.codeRun.findFirstOrThrow({ where: { attemptId } });
    await t.prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
        src code_runs%ROWTYPE;
        questions uuid[] := ARRAY['${questionIds.join("','")}']::uuid[];
        new_id uuid;
      BEGIN
        SELECT * INTO src FROM code_runs WHERE id = '${source.id}';
        FOR i IN 1..${RUNS - existing} LOOP
          new_id := gen_random_uuid();
          INSERT INTO code_runs (id, activity_id, question_id, attempt_id, student_user_id, execution, source_code,
                                 public_case_count, created_at, deadline_at)
          VALUES (new_id, src.activity_id, questions[1 + (i % ${QUESTIONS})], src.attempt_id, src.student_user_id, src.execution,
                  'print(1)', src.public_case_count, src.created_at - (i * interval '1 second'),
                  src.deadline_at - (i * interval '1 second'));
          UPDATE code_runs SET status = 'FAILED', failure_reason = 'EXPIRED', finished_at = src.finished_at WHERE id = new_id;
        END LOOP;
      END $$`);
    await t.prisma.$executeRawUnsafe("ANALYZE code_runs");
    expect(await t.prisma.codeRun.count({ where: { attemptId } })).toBe(RUNS);

    const first = await getAttemptCodeRuns(teacher, classId, activityId, attemptId);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.questions).toHaveLength(QUESTIONS);
    expect(first.body.questions.reduce((sum: number, question: { runCount: number }) => sum + question.runCount, 0)).toBe(RUNS);

    const durations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      const { res, ms } = await timed(() => getAttemptCodeRuns(teacher, classId, activityId, attemptId));
      expect(res.status).toBe(200);
      if (i >= 0) durations.push(ms);
    }
    expect(p95(durations)).toBeLessThan(SUMMARY_P95_MS);
  });
});
