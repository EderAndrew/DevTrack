import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, startAttempt } from "../helpers/activities";
import { resetAiDb, type AiTestApp } from "../helpers/ai";
import { DAY, FixedClock, MINUTE } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp, requestHelp } from "../helpers/work-help";

const START = "2026-10-01T12:00:00.000Z";
const ROSTER = 60;
const EVENTS_PER_STUDENT = 20;
const SUMMARY_MS = 1000;
const BATCHES = 100;
const BATCH_SIZE = 10;
const BATCH_P95_MS = 200;
const HELP_REQUESTS = 10;
const HELP_MS = 500;

const p95 = (values: number[]) => [...values].sort((x, y) => x - y)[Math.ceil(values.length * 0.95) - 1]!;
async function timed<T>(call: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const result = await call();
  return [result, performance.now() - started];
}

/**
 * 015 plan "Performance Goals": a batch of 10 events p95 < 200 ms over 100 calls; a help request
 * answered (202, the execution queued) < 500 ms; the teacher's summary of a 60-student roster with 20
 * events each < 1 s. The roster's students, attempts and events are bulk-inserted in one
 * transaction; each read is warmed once, then the slowest of three calls is measured through HTTP.
 */
describe("015 desempenho dos eventos, do pedido de ajuda e do resumo da turma", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let activity: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);

  /** `count` students, each with an IN_PROGRESS attempt and `EVENTS_PER_STUDENT` exits and returns a minute apart. */
  async function populate(count: number) {
    const passwordHash = (await t.prisma.user.findUniqueOrThrow({ where: { id: teacher.id } })).passwordHash;
    await t.prisma.runInTransaction(async (tx) => {
      const users = Array.from({ length: count }, (_, i) => ({
        id: crypto.randomUUID(),
        email: `aluno-${i}-${crypto.randomUUID()}@example.test`,
        name: `Aluno ${String(i).padStart(3, "0")}`,
        passwordHash,
        emailVerifiedAt: at(-DAY),
      }));
      await tx.user.createMany({ data: users });
      await tx.studentProfile.createMany({ data: users.map((user) => ({ userId: user.id, displayName: user.name })) });
      await tx.enrollment.createMany({ data: users.map((user) => ({ classId: schoolClass.id, studentUserId: user.id, status: "ACTIVE" as const, enrolledAt: at(-DAY) })) });
      const attempts = users.map((user) => ({ id: crypto.randomUUID(), activityId: activity.activity.id, studentUserId: user.id, number: 1, startedAt: at(-DAY), status: "IN_PROGRESS" as const }));
      await tx.activityAttempt.createMany({ data: attempts });
      await tx.attemptIntegrityEvent.createMany({
        data: attempts.flatMap((attempt) =>
          Array.from({ length: EVENTS_PER_STUDENT }, (_, e) => ({
            attemptId: attempt.id,
            activityId: activity.activity.id,
            studentUserId: attempt.studentUserId,
            clientEventId: crypto.randomUUID(),
            type: e % 2 === 0 ? ("SCREEN_LEFT" as const) : ("SCREEN_RETURNED" as const),
            recordedAt: at(-DAY + e * MINUTE),
          })),
        ),
      });
    });
  }

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createWorkHelpApp({
      clock,
      config: { rateLimit: { ...testConfig().rateLimit, attemptEventsPerMinute: 100_000, workHelpPerHour: 1000, aiExecutionsPerMinute: 1000 } },
    });
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    schoolClass = await createClass(t, teacher.id, { name: "Turma de 60" });
    activity = await createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });
    await populate(ROSTER);
  });
  afterAll(() => t.close());

  it(`resumo de ${ROSTER} alunos com ${EVENTS_PER_STUDENT} eventos cada < ${SUMMARY_MS} ms`, async () => {
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const path = `/api/classes/${schoolClass.id}/activities/${activity.activity.id}/integrity`;
    const [warm] = await timed(() => client.get(path));
    expect(warm.status).toBe(200);
    expect(warm.body.items).toHaveLength(ROSTER);
    expect(warm.body.items[0].screenExits).toBe(EVENTS_PER_STUDENT / 2);
    const times: number[] = [];
    for (let i = 0; i < 3; i += 1) times.push((await timed(() => client.get(path)))[1]);
    expect(Math.max(...times)).toBeLessThan(SUMMARY_MS);
  });

  it(`lote de ${BATCH_SIZE} eventos: p95 < ${BATCH_P95_MS} ms em ${BATCHES} chamadas`, async () => {
    const student = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, student.id);
    const client = api(t, { cookie: await loginAs(t, student) });
    expect((await startAttempt(client, activity.activity.id)).status).toBe(200);
    const batch = () => Array.from({ length: BATCH_SIZE }, (_, e) => integrityEvent(e % 2 === 0 ? "SCREEN_LEFT" : "SCREEN_RETURNED"));
    expect((await recordEvents(client, activity.activity.id, batch())).status).toBe(200);
    const times: number[] = [];
    for (let i = 0; i < BATCHES; i += 1) {
      const [res, ms] = await timed(() => recordEvents(client, activity.activity.id, batch()));
      expect(res.status).toBe(200);
      times.push(ms);
    }
    expect(p95(times)).toBeLessThan(BATCH_P95_MS);
  });

  it(`pedido de ajuda (202, execução na fila) < ${HELP_MS} ms`, async () => {
    const times: number[] = [];
    for (let i = 0; i < HELP_REQUESTS; i += 1) {
      const student = await createUser(t, { roles: ["STUDENT"] });
      await createEnrollment(t, schoolClass.id, student.id);
      const client = api(t, { cookie: await loginAs(t, student) });
      expect((await startAttempt(client, activity.activity.id)).status).toBe(200);
      const [res, ms] = await timed(() => requestHelp(client, activity.activity.id, { questionId: activity.questionIds[0]!, question: "Por onde começo?" }));
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      // The first request warms the routes.
      if (i > 0) times.push(ms);
    }
    expect(Math.max(...times)).toBeLessThan(HELP_MS);
  });
});
