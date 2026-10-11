import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, startAttempt } from "../helpers/activities";
import { declareExit, markPresent, releasePause } from "../helpers/attendance";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const RATE_LIMITED = { statusCode: 429, code: "RATE_LIMITED", message: expect.any(String) };

/**
 * 016 contracts/configuration.md, research M11: `RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR` (default 20)
 * declared exits per student and hour. The counter is hit on the pause's own transaction, under the
 * attempt's lock (the 015 pool lesson), so a refused declaration rolls it back with everything else.
 * Over the limit → 429 RATE_LIMITED with `Retry-After` and no pause; another student is untouched.
 */
describe("016 limite de declarações de saída", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: ReturnType<typeof api>;
  let schoolClass: SchoolClass;
  let activity: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const student = async () => {
    const user = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, user.id);
    expect((await markPresent(teacherClient, schoolClass.id, activity.activity.id, [user.id])).status).toBe(200);
    return { user, client: api(t, { cookie: await loginAs(t, user) }) };
  };
  /** Declares an exit and has the teacher release it at once, so the next declaration opens a new pause. */
  const exitAndReturn = async (client: ReturnType<typeof api>) => {
    const res = await declareExit(client, activity.activity.id, { reason: "WATER" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await releasePause(teacherClient, schoolClass.id, activity.activity.id, res.body.id)).status).toBe(200);
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    schoolClass = await createClass(t, teacher.id);
    activity = await createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });
  });

  it("016/FR-011 a 21ª declaração na hora → 429 com Retry-After e nenhuma pausa; outro aluno segue", async () => {
    expect(t.config.rateLimit.attemptPausesPerHour).toBe(20);
    const first = await student();
    expect((await startAttempt(first.client, activity.activity.id)).status).toBe(200);
    for (let index = 0; index < 20; index += 1) await exitAndReturn(first.client);
    const over = await declareExit(first.client, activity.activity.id, { reason: "PHONE" });
    expect([over.status, over.body]).toEqual([429, RATE_LIMITED]);
    expect(Number(over.headers["retry-after"])).toBeGreaterThan(0);
    expect(await t.prisma.attemptPause.count({ where: { studentUserId: first.user.id } })).toBe(20);
    expect(await t.prisma.attemptPause.count({ where: { studentUserId: first.user.id, releasedAt: null } })).toBe(0);

    const second = await student();
    expect((await startAttempt(second.client, activity.activity.id)).status).toBe(200);
    expect((await declareExit(second.client, activity.activity.id, { reason: "PHONE" })).status).toBe(201);
  });

  it("016/FR-011 contada na transação da pausa: uma declaração recusada (409) não consome o limite", async () => {
    const own = await student();
    // Not started: each refusal rolls the counter back with the operation.
    for (let index = 0; index < 25; index += 1) {
      expect((await declareExit(own.client, activity.activity.id, { reason: "WATER" })).body.code).toBe("NOT_STARTED");
    }
    expect((await startAttempt(own.client, activity.activity.id)).status).toBe(200);
    expect((await declareExit(own.client, activity.activity.id, { reason: "WATER" })).status).toBe(201);
  });
});
