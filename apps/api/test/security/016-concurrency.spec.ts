import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { declareExit, markPresent, releasePause, unmark } from "../helpers/attendance";
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
 * presence, and never a 500. The pause part (US3, research M6, M7): ten simultaneous exits leave one
 * open pause; a save or a submit racing an exit is serialized by the attempt's row lock, so what
 * reaches it before the pause is accepted and what comes after is `409 ATTEMPT_PAUSED` — never a
 * submission from PAUSED; two releases end the pause once and never touch the next one.
 */
describe("016/SC-007 concorrência da chamada e da pausa", () => {
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

  /** A work with one open answer, the student marked present and started. */
  const answering = async (): Promise<CreatedActivity> => {
    const created = await work();
    expect((await markPresent(teacherClient, schoolClass.id, created.activity.id, [student.id])).status).toBe(200);
    expect((await startAttempt(studentClient, created.activity.id)).status).toBe(200);
    return created;
  };
  const textAnswer = (created: CreatedActivity, text: string, baseRevision = 0) => [
    { questionId: created.questionIds[0]!, answer: { kind: "TEXT" as const, text }, baseRevision },
  ];
  const openPauses = (activityId: string) => t.prisma.attemptPause.count({ where: { activityId, releasedAt: null } });

  it("016/SC-007 016/US3-8 10 declarações de saída simultâneas → uma pausa aberta, um attempt_pause.started; uma 201 e as demais 200 com a mesma", async () => {
    const { activity } = await answering();
    const responses = await Promise.all(Array.from({ length: PARALLEL }, () => declareExit(studentClient, activity.id, { reason: "WATER" })));
    expect(responses.map((res) => res.status).sort((a, b) => b - a)).toEqual([201, ...Array(PARALLEL - 1).fill(200)]);
    expect(new Set(responses.map((res) => res.body.id)).size).toBe(1);
    expect(await openPauses(activity.id)).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "attempt_pause.started" } })).toBe(1);
  });

  it("016/SC-007 016/US3-9 salvar × pausar: o salvamento antes da pausa fica gravado, o depois é 409 ATTEMPT_PAUSED sem gravar nada", async () => {
    const outcomes = new Set<string>();
    for (let round = 0; round < ROUNDS; round += 1) {
      const created = await answering();
      const [saved, paused] = await Promise.all([
        saveAnswers(studentClient, created.activity.id, textAnswer(created, `rodada ${round}`)),
        declareExit(studentClient, created.activity.id, { reason: "PHONE" }),
      ]);
      expect(paused.status).toBe(201);
      const stored = await t.prisma.activityAnswer.count({ where: { activityId: created.activity.id } });
      if (saved.status === 200) {
        expect(stored).toBe(1);
        outcomes.add("saved");
      } else {
        expect({ status: saved.status, code: saved.body.code, stored }).toEqual({ status: 409, code: "ATTEMPT_PAUSED", stored: 0 });
        outcomes.add("refused");
      }
      expect(await openPauses(created.activity.id)).toBe(1);
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it("016/SC-007 016/US3-9 entregar × pausar: ou entregue sem pausa, ou pausada sem entrega; nunca entrega a partir de PAUSADA", async () => {
    const outcomes = new Set<string>();
    for (let round = 0; round < ROUNDS; round += 1) {
      const created = await answering();
      const [submitted, paused] = await Promise.all([
        submitAttempt(studentClient, created.activity.id, textAnswer(created, `entrega ${round}`)),
        declareExit(studentClient, created.activity.id, { reason: "BATHROOM" }),
      ]);
      const state = {
        submissions: await t.prisma.activitySubmission.count({ where: { activityId: created.activity.id } }),
        pauses: await t.prisma.attemptPause.count({ where: { activityId: created.activity.id } }),
      };
      if (submitted.status === 200) {
        expect({ pause: paused.body.code, ...state }).toEqual({ pause: "ATTEMPT_ALREADY_SUBMITTED", submissions: 1, pauses: 0 });
        outcomes.add("submitted");
      } else {
        expect({ submit: submitted.body.code, pause: paused.status, ...state }).toEqual({ submit: "ATTEMPT_PAUSED", pause: 201, submissions: 0, pauses: 1 });
        outcomes.add("paused");
      }
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it("016/SC-007 016/US3-8 liberar duas vezes ao mesmo tempo encerra a pausa uma vez; uma liberação atrasada não toca a pausa seguinte", async () => {
    const { activity } = await answering();
    const first = await declareExit(studentClient, activity.id, { reason: "WATER" });
    const releases = await Promise.all(Array.from({ length: PARALLEL }, () => releasePause(teacherClient, schoolClass.id, activity.id, first.body.id)));
    expect(releases.map((res) => res.status)).toEqual(Array(PARALLEL).fill(200));
    expect(new Set(releases.map((res) => res.body.endedAt)).size).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "attempt_pause.released" } })).toBe(1);
    const next = await declareExit(studentClient, activity.id, { reason: "PHONE" });
    expect(next.status).toBe(201);
    const late = await Promise.all([
      releasePause(teacherClient, schoolClass.id, activity.id, first.body.id),
      releasePause(teacherClient, schoolClass.id, activity.id, first.body.id),
    ]);
    expect(late.map((res) => res.status)).toEqual([200, 200]);
    expect((await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: next.body.id } })).releasedAt).toBeNull();
    expect(await openPauses(activity.id)).toBe(1);
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
