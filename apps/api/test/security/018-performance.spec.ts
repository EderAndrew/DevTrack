import type { TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { applyExam, approvedExam, decideHold, getExamMonitor, holdByHand, startExam } from "../helpers/exams";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

// The real time (to the minute): the DB triggers of a return compare `ends_at` with the database's `now()`.
const START = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
const SECOND = 1000;
const ROOM = 60;
const EVENTS_P95_MS = 200;
const MONITOR_P95_MS = 300;
const DECISION_P95_MS = 300;
const CALLS = 40;

const p95 = (durations: number[]) => [...durations].sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1]!;

/**
 * 018 plan "Performance Goals": an events batch with the occurrence counting (under the attempt's lock)
 * p95 < 200 ms; the exam monitor of 60 students, with holds and occurrences, p95 < 300 ms; a decision on
 * a hold p95 < 300 ms. Each call is measured end to end through HTTP after a warm-up.
 */
describe("018 desempenho das ocorrências, do monitor e das decisões", () => {
  let t: TestApp;
  let clock: FixedClock;
  let client: ReturnType<typeof api>;
  let classId: string;
  let room: { user: TestUser; client: ReturnType<typeof api> }[];
  let eventsExam: TeacherActivity;
  let decisionsExam: TeacherActivity;
  let exam: { id: string };

  const timed = async <T extends { status: number }>(call: () => Promise<T>) => {
    const start = performance.now();
    const res = await call();
    return { res, ms: performance.now() - start };
  };
  const applied = async () => {
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, examDecisionsPerMinute: 10_000, attemptEventsPerMinute: 10_000 } } });
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const schoolClass = await createClass(t, teacher.id, { name: "Turma de 60", subjectId: syllabus.subject.id });
    classId = schoolClass.id;
    room = [];
    for (let i = 0; i < ROOM; i++) {
      const user = await createUser(t, { roles: ["STUDENT"], name: `Aluno ${String(i).padStart(2, "0")}` });
      await createEnrollment(t, classId, user.id);
      room.push({ user, client: api(t, { cookie: await loginAs(t, user) }) });
    }
    exam = await approvedExam(t, client, syllabus);
    eventsExam = await applied();
    decisionsExam = await applied();
    for (const student of room) {
      expect((await startExam(student.client, eventsExam.id)).status).toBe(200);
      expect((await startExam(student.client, decisionsExam.id)).status).toBe(200);
    }
    // The decisions' exam: every attempt on hold.
    const attempts = await t.prisma.activityAttempt.findMany({ where: { activityId: decisionsExam.id } });
    for (const attempt of attempts) await holdByHand(t, attempt, clock.now());
  }, 300_000);
  afterAll(() => t.close());

  it(`lote de eventos com a contagem das ocorrências p95 < ${EVENTS_P95_MS} ms`, async () => {
    await recordEvents(room[0]!.client, eventsExam.id, [integrityEvent("SCREEN_RETURNED")]);
    const durations: number[] = [];
    // Two rounds over the room, 5 s apart on the server's clock: warnings 1 and 2 for everyone.
    for (let round = 0; round < 2; round += 1) {
      for (const student of room) {
        const { res, ms } = await timed(() =>
          recordEvents(student.client, eventsExam.id, [integrityEvent("SCREEN_LEFT"), integrityEvent("SCREEN_RETURNED"), integrityEvent("FULLSCREEN_EXITED")]),
        );
        expect([res.status, res.body.exam?.held], JSON.stringify(res.body)).toEqual([200, false]);
        durations.push(ms);
      }
      clock.advance(5 * SECOND);
    }
    expect(await t.prisma.examOccurrence.count({ where: { activityId: eventsExam.id } })).toBe(2 * ROOM);
    expect(p95(durations)).toBeLessThan(EVENTS_P95_MS);
  });

  it(`monitor de ${ROOM} alunos com retenções e ocorrências p95 < ${MONITOR_P95_MS} ms`, async () => {
    await getExamMonitor(client, classId, decisionsExam.id);
    const durations: number[] = [];
    for (let i = 0; i < CALLS; i += 1) {
      const activityId = i % 2 === 0 ? decisionsExam.id : eventsExam.id;
      const { res, ms } = await timed(() => getExamMonitor(client, classId, activityId));
      expect([res.status, res.body.students?.length]).toEqual([200, ROOM]);
      durations.push(ms);
    }
    expect(p95(durations)).toBeLessThan(MONITOR_P95_MS);
  });

  it(`decisão sobre uma retenção p95 < ${DECISION_P95_MS} ms`, async () => {
    const holds = await t.prisma.examAttemptHold.findMany({ where: { activityId: decisionsExam.id }, select: { id: true } });
    expect(holds).toHaveLength(ROOM);
    const durations: number[] = [];
    for (const [index, hold] of holds.entries()) {
      const decision = index % 2 === 0 ? "return" : "cancel";
      const { res, ms } = await timed(() => decideHold(client, classId, decisionsExam.id, hold.id, decision));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      // The first is the warm-up.
      if (index > 0) durations.push(ms);
    }
    expect(p95(durations)).toBeLessThan(DECISION_P95_MS);
  });
});
