import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixedClock, HOUR } from "../helpers/clock";
import { createUser, loginAs } from "../helpers/factories";
import { sendFeedback } from "../helpers/feedback";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const CREATE_P95_MS = 150;
const READ_P95_MS = 100;
const CALLS = 40;
/** Feedbacks already in the table: the other student's and the measured student's own. */
const HISTORY = 5_000;

const p95 = (durations: number[]) => [...durations].sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1]!;

/**
 * 020 plan "Performance Goals" (API only): sending a feedback p95 < 150 ms, and the ADMIN's list
 * (with and without filters), the summary, the detail and "Meus feedbacks" p95 < 100 ms, with 5 000
 * feedbacks already in the table. Each call is measured end to end through HTTP after a warm-up. The
 * injected clock moves 5 h between two sends, so the limit of 5 in 24 h never refuses one.
 */
describe("020 desempenho das rotas de feedback", () => {
  let t: TestApp;
  let clock: FixedClock;
  let student: ReturnType<typeof api>;
  let admin: ReturnType<typeof api>;
  let feedbackId: string;

  const timed = async <T extends { status: number }>(call: () => Promise<T>) => {
    const start = performance.now();
    const res = await call();
    return { res, ms: performance.now() - start };
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
    await resetDb(t.prisma);
    const studentUser = await createUser(t, { roles: ["STUDENT"] });
    const other = await createUser(t, { roles: ["STUDENT"] });
    student = api(t, { cookie: await loginAs(t, studentUser) });
    admin = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) });

    // Half of the history is the student's, the rest the other student's; a quarter is RESOLVED.
    await t.prisma.$executeRaw`
      INSERT INTO student_feedbacks (student_id, submission_id, category, message, origin_path, status, created_at, status_changed_at)
      SELECT CASE WHEN i % 2 = 0 THEN ${studentUser.id}::uuid ELSE ${other.id}::uuid END, gen_random_uuid(),
             (ARRAY['PROBLEM', 'SUGGESTION', 'PRAISE', 'OTHER'])[1 + i % 4]::student_feedback_category,
             repeat('Mensagem de desempenho. ', 40), '/painel',
             (CASE WHEN i % 4 = 0 THEN 'RESOLVED' ELSE 'RECEIVED' END)::student_feedback_status,
             ${clock.now()}::timestamptz - (i * interval '1 hour') - interval '30 days',
             ${clock.now()}::timestamptz - (i * interval '1 hour') - interval '30 days'
      FROM generate_series(1, ${HISTORY}) AS i`;
    await t.prisma.$executeRawUnsafe("ANALYZE student_feedbacks");
    feedbackId = (await t.prisma.studentFeedback.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).id;
  }, 120_000);
  afterAll(() => t.close());

  it(`020 enviar um feedback p95 < ${CREATE_P95_MS} ms`, async () => {
    const durations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      clock.advance(5 * HOUR);
      const { res, ms } = await timed(() => sendFeedback(student));
      expect(res.status).toBe(201);
      if (i >= 0) durations.push(ms);
    }
    expect(p95(durations)).toBeLessThan(CREATE_P95_MS);
  });

  const reads: Array<[string, () => ReturnType<typeof api>, () => string]> = [
    ["lista do ADMIN", () => admin, () => "/api/feedbacks"],
    ["lista do ADMIN filtrada", () => admin, () => "/api/feedbacks?status=RECEIVED&category=PROBLEM"],
    ["contador de Recebido", () => admin, () => "/api/feedbacks/summary"],
    ["detalhe", () => admin, () => `/api/feedbacks/${feedbackId}`],
    ["Meus feedbacks", () => student, () => "/api/me/feedbacks"],
  ];

  it.each(reads)(`020 %s p95 < ${READ_P95_MS} ms`, async (_name, client, path) => {
    const durations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      const { res, ms } = await timed(() => client().get(path()));
      expect(res.status).toBe(200);
      if (i >= 0) durations.push(ms);
    }
    expect(p95(durations)).toBeLessThan(READ_P95_MS);
  });
});
