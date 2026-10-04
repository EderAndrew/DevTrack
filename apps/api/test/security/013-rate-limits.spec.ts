import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { completeAttempt, createActivity, type CreatedActivity, retryAttempt, startAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const EXERCISE_ATTEMPTS = 3;
const SUBMITS = 1;
const TEACHER_WRITES = 2;
const RATE_LIMITED = { statusCode: 429, code: "RATE_LIMITED", message: expect.any(String) };

/**
 * 013 research K16 (contracts/configuration.md): start, retry and complete of EXERCISE activities share
 * `exerciseAttemptsPerHour` per student, apart from 012's submits limit (kept for ASSIGNMENT); marks
 * count in the teacher's writes. Over the limit → 429 RATE_LIMITED with `Retry-After`, and nothing is
 * written; another student's counter is untouched.
 */
describe("013 limite de tentativas de exercício e de marcações", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let exercise: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const student = async () => {
    const user = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, user.id);
    return { user, client: api(t, { cookie: await loginAs(t, user) }) };
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({
      clock,
      config: {
        rateLimit: {
          ...testConfig().rateLimit,
          exerciseAttemptsPerHour: EXERCISE_ATTEMPTS,
          activitySubmitsPerHour: SUBMITS,
          activityTeacherWritesPerHour: TEACHER_WRITES,
        },
      },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    schoolClass = await createClass(t, teacher.id);
    exercise = await createActivity(t, schoolClass, {
      type: "EXERCISE",
      publishAt: at(-DAY),
      questions: [
        { type: "OPEN_ANSWER", difficulty: "BASIC" },
        { type: "OPEN_ANSWER", difficulty: "INTERMEDIATE" },
        { type: "OPEN_ANSWER", difficulty: "ADVANCED" },
      ],
    });
  });

  it("013 iniciar, refazer e concluir acima do limite por hora → 429 sem gravar; outro aluno e o Trabalho seguem", async () => {
    const { user, client } = await student();
    const id = exercise.activity.id;
    const answers = [{ questionId: exercise.questionIds[0]!, answer: text("x"), baseRevision: 0 }];
    expect((await startAttempt(client, id)).status).toBe(200);
    expect((await completeAttempt(client, id, 1, answers)).status).toBe(200);
    expect((await retryAttempt(client, id, 1)).status).toBe(200);

    const completed = await t.prisma.auditEvent.count({ where: { type: "exercise_attempt.completed" } });
    const blocked = await completeAttempt(client, id, 2, answers);
    expect([blocked.status, blocked.body]).toEqual([429, RATE_LIMITED]);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    const attempt2 = await t.prisma.activityAttempt.findFirstOrThrow({ where: { studentUserId: user.id, number: 2 } });
    expect([attempt2.status, attempt2.completedAt]).toEqual(["IN_PROGRESS", null]);
    expect(await t.prisma.activityAnswer.count({ where: { attemptId: attempt2.id } })).toBe(0);
    expect(await t.prisma.exerciseQuestionResult.count({ where: { attemptId: attempt2.id } })).toBe(0);
    expect(await t.prisma.auditEvent.count({ where: { type: "exercise_attempt.completed" } })).toBe(completed);

    // The limit is per student, and apart from 012's submits limit (1 here): a Trabalho still starts.
    const other = await student();
    expect((await startAttempt(other.client, id)).status).toBe(200);
    const work = await createActivity(t, schoolClass, { publishAt: at(-DAY), deadline: at(7 * DAY) });
    expect((await startAttempt(client, work.activity.id)).status).toBe(200);
  });

  it("013 marcações contam nas escritas do professor: acima do limite → 429 e a marcação não muda", async () => {
    const { client } = await student();
    const id = exercise.activity.id;
    await startAttempt(client, id);
    await completeAttempt(
      client,
      id,
      1,
      exercise.questionIds.map((questionId) => ({ questionId, answer: text("Resposta"), baseRevision: 0 })),
    );
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: id } });
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const path = `/api/classes/${schoolClass.id}/activities/${id}/attempts/${attempt.id}/marks`;
    for (const questionId of exercise.questionIds.slice(0, TEACHER_WRITES)) {
      expect((await teacherClient.put(path, { marks: [{ questionId, result: "CORRECT" }] })).status).toBe(200);
    }
    const last = exercise.questionIds[TEACHER_WRITES]!;
    const blocked = await teacherClient.put(path, { marks: [{ questionId: last, result: "CORRECT" }] });
    expect([blocked.status, blocked.body]).toEqual([429, RATE_LIMITED]);
    const row = await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId: attempt.id, questionId: last } });
    expect([row.result, row.points]).toEqual(["PENDING_TEACHER", 0]);
    expect(await t.prisma.auditEvent.count({ where: { type: "exercise_result.marked" } })).toBe(TEACHER_WRITES);
  });
});
