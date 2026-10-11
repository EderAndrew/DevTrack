import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, startAttempt } from "../helpers/activities";
import { markPresent, unmark } from "../helpers/attendance";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const PARALLEL = 10;
const ROUNDS = 8;

/**
 * 016 concurrency (016/SC-007, research M5): the attendance part. Ten simultaneous marks of the same
 * student leave one presence and one `attendance.marked`; an unmark racing the student's start ends
 * either with the attempt and the presence (the unmark refused with `409 ATTENDANCE_STARTED`) or with
 * neither (the start answered 404, as for any student not released) — never an attempt without a
 * presence, and never a 500. The pause part of SC-007 joins with US3.
 */
describe("016/SC-007 concorrência da chamada", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let teacherClient: ReturnType<typeof api>;
  let studentClient: ReturnType<typeof api>;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const work = (): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });
  const presences = (activityId: string) => t.prisma.activityAttendance.count({ where: { activityId, studentUserId: student.id } });
  const attempts = (activityId: string) => t.prisma.activityAttempt.count({ where: { activityId, studentUserId: student.id } });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    schoolClass = await createClass(t, teacher.id);
    student = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, student.id);
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    studentClient = api(t, { cookie: await loginAs(t, student) });
  });

  it("016/SC-007 016/US2-5 10 marcações simultâneas do mesmo aluno → uma presença e um attendance.marked, todas 200", async () => {
    const { activity } = await work();
    const responses = await Promise.all(Array.from({ length: PARALLEL }, () => markPresent(teacherClient, schoolClass.id, activity.id, [student.id])));
    expect(responses.map((res) => res.status)).toEqual(Array(PARALLEL).fill(200));
    expect(await presences(activity.id)).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "attendance.marked", targetId: activity.id } })).toBe(1);
  });

  it("016/SC-007 016/FR-005 desmarcar × iniciar simultâneos: ou tentativa e presença (409 ATTENDANCE_STARTED), ou nenhuma das duas (404); nunca tentativa sem presença", async () => {
    const outcomes = new Set<string>();
    for (let round = 0; round < ROUNDS; round += 1) {
      const { activity } = await work();
      expect((await markPresent(teacherClient, schoolClass.id, activity.id, [student.id])).status).toBe(200);
      const [unmarked, started] = await Promise.all([unmark(teacherClient, schoolClass.id, activity.id, [student.id]), startAttempt(studentClient, activity.id)]);
      const state = { presence: await presences(activity.id), attempt: await attempts(activity.id) };
      if (started.status === 200) {
        expect({ unmark: unmarked.body.code, ...state }).toEqual({ unmark: "ATTENDANCE_STARTED", presence: 1, attempt: 1 });
        outcomes.add("started");
      } else {
        expect({ unmark: unmarked.status, start: started.status, ...state }).toEqual({ unmark: 200, start: 404, presence: 0, attempt: 0 });
        outcomes.add("unmarked");
      }
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it("016/SC-007 o início que leu a presença antes de a desmarcação travá-la espera e responde 404, sem tentativa e sem 500", async () => {
    const { activity } = await work();
    expect((await markPresent(teacherClient, schoolClass.id, activity.id, [student.id])).status).toBe(200);
    let start: Promise<Awaited<ReturnType<typeof startAttempt>>> | undefined;
    // The unmark's own order (research M5): the presence `FOR UPDATE`, no attempt, delete. Here the
    // start arrives while the presence is held, so it must wait on it and then find it gone.
    await t.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM activity_attendances WHERE activity_id = ${activity.id}::uuid AND student_user_id = ${student.id}::uuid FOR UPDATE`;
        // supertest sends on `then`: `Promise.resolve` fires the request now.
        start = Promise.resolve(startAttempt(studentClient, activity.id));
        await waitForLockWait(t);
        await tx.$executeRaw`DELETE FROM activity_attendances WHERE activity_id = ${activity.id}::uuid AND student_user_id = ${student.id}::uuid`;
      },
      { timeout: 15_000 },
    );
    const res = await start!;
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: "NOT_FOUND" });
    expect({ presence: await presences(activity.id), attempt: await attempts(activity.id) }).toEqual({ presence: 0, attempt: 0 });
  });
});

/** Waits until some backend of the test database is blocked on a row lock (the start, above). */
async function waitForLockWait(t: TestApp): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    const [row] = await t.prisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (row && row.waiting > 0n) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the start never waited on the presence lock");
}
