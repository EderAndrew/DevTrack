import type { ExamMonitor } from "@repo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixedClock } from "../helpers/clock";
import { createNudge, dismissByHand, getStudentNudge, monitorPath, type NudgeScene, nudgeScene, occur, sendNudge } from "../helpers/exam-nudges";
import { mobileApi } from "../helpers/mobile";
import { createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const ROOM = 40;
const HISTORY = 3;
const CALLS = 40;
const POLL_P95_MS = 50;
const SEND_P95_MS = 150;
/** The 018 monitor's target (`018-performance.spec.ts`, a room of 60), kept with the new lateral read. */
const MONITOR_P95_MS = 300;

const p95 = (durations: number[]) => [...durations].sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1]!;

/**
 * 025 plan "Performance Goals", each call measured end to end through HTTP after a warm-up, in a room of 40 students
 * with 2 occurrences each, 3 closed warnings each and one pending for half of them: the student's poll p95 < 50 ms, a
 * send p95 < 150 ms and the monitor with the `nudge` aggregate inside the 018 target.
 */
describe("025 desempenho do aviso discreto", () => {
  let t: TestApp;
  let clock: FixedClock;
  let scene: NudgeScene;
  let everyone: { client: NudgeScene["studentClient"]; attemptId: string }[];

  const timed = async (call: () => Promise<{ status: number; body: unknown }>, status: number) => {
    const start = performance.now();
    const res = await call();
    const ms = performance.now() - start;
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    return { res, ms };
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, mobileWritesPerMinute: 100_000 } } });
    await resetDb(t.prisma);
    scene = await nudgeScene(t, clock, { classmates: ROOM - 1 });
    everyone = [{ client: scene.studentClient, attemptId: scene.attemptId }, ...scene.classmates.map(({ client, attemptId }) => ({ client, attemptId }))];
    for (const one of scene.classmates) await occur(clock, { studentClient: one.client, activityId: scene.activityId }, 2);
    for (const [index, one] of everyone.entries()) {
      const target = { attemptId: one.attemptId, activityId: scene.activityId, teacher: scene.teacher };
      for (let i = 0; i < HISTORY; i++) {
        const sentAt = clock.now();
        clock.advance(1000);
        await createNudge(t, target, { sentAt, dismissedAt: clock.now() });
      }
      if (index % 2 === 0) await createNudge(t, target, { sentAt: clock.now() });
    }
    await t.prisma.$executeRawUnsafe("ANALYZE exam_nudges");
  }, 300_000);
  afterAll(() => t.close());

  it(`025 consulta do aluno GET …/attempt/exam-nudge p95 < ${POLL_P95_MS} ms`, async () => {
    const durations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      const one = everyone[(i + CALLS) % ROOM]!;
      const { ms } = await timed(() => getStudentNudge(one.client, scene.activityId), 200);
      if (i >= 0) durations.push(ms);
    }
    expect(p95(durations)).toBeLessThan(POLL_P95_MS);
  });

  it(`025 monitor de ${ROOM} alunos com o agregado nudge p95 < ${MONITOR_P95_MS} ms`, async () => {
    const phone = mobileApi(t, scene.token);
    const durations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      const { res, ms } = await timed(() => phone.get(monitorPath(scene.classId, scene.activityId)), 200);
      if (i === -3) expect((res.body as ExamMonitor).students.every((row) => row.nudge && row.nudge.sentCount >= HISTORY)).toBe(true);
      if (i >= 0) durations.push(ms);
    }
    expect(p95(durations)).toBeLessThan(MONITOR_P95_MS);
  });

  it(`025 envio pelo sino p95 < ${SEND_P95_MS} ms`, async () => {
    const durations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      const one = everyone[(i + CALLS) % ROOM]!;
      // A pending warning is closed first (outside the measure), so every measured send creates one.
      const pending = await t.prisma.examNudge.findFirst({ where: { attemptId: one.attemptId, dismissedAt: null } });
      if (pending) await dismissByHand(t, pending.id, clock.now());
      const { ms } = await timed(() => sendNudge(t, { ...scene, attemptId: one.attemptId }), 201);
      if (i >= 0) durations.push(ms);
    }
    expect(p95(durations)).toBeLessThan(SEND_P95_MS);
  });
});
