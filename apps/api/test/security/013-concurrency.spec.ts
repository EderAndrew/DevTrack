import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type ActivityQuestionSpec, completeAttempt, createActivity, type CreatedActivity, retryAttempt, saveAnswers, startAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

/**
 * 013/SC-003 013/US2-6 013/US2-7 (research K3–K8) under simultaneous requests: 10 conclusions of the
 * same attempt → one conclusion and one event; 10 "Refazer" → one practice attempt; two activities with
 * the same bank exercise concluded at once → one scoring row (the partial UNIQUE); a save racing the
 * conclusion lands before it or is refused; a mark racing the cancellation either lands and stops
 * counting, or is refused with nothing changed.
 */

const START = "2026-10-01T12:00:00.000Z";

describe("013/SC-003 concorrência de concluir, refazer, pontuar e marcar", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let client: ReturnType<typeof api>;
  let schoolClass: SchoolClass;

  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const events = (type: string) => t.prisma.auditEvent.count({ where: { type } });
  const exerciseActivity = (questions: ActivityQuestionSpec[]): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, { type: "EXERCISE", publishAt: new Date(clock.now().getTime() - DAY), questions });

  beforeAll(async () => {
    clock = new FixedClock(START);
    // Many requests in a burst: the per-student and per-teacher limits stay out of the way (013-rate-limits covers them).
    const base = testConfig();
    t = await createTestApp({
      clock,
      config: { rateLimit: { ...base.rateLimit, exerciseAttemptsPerHour: 1_000, activitySavesPerMinute: 1_000, activityTeacherWritesPerHour: 1_000 } },
    });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    student = await createUser(t, { roles: ["STUDENT"] });
    client = api(t, { cookie: await loginAs(t, student) });
    schoolClass = await createClass(t, teacher.id);
    await createEnrollment(t, schoolClass.id, student.id);
  });

  it("013/SC-003 013/US2-6 10 conclusões simultâneas da mesma tentativa → uma conclusão e um evento, todas com o mesmo resultado", async () => {
    const { activity, questionIds, correctAlternativeIds } = await exerciseActivity([{ type: "MULTIPLE_CHOICE", difficulty: "ADVANCED" }]);
    await startAttempt(client, activity.id);
    const answers = [{ questionId: questionIds[0]!, answer: { kind: "ALTERNATIVE" as const, alternativeId: correctAlternativeIds[0]! }, baseRevision: 0 }];
    const results = await Promise.all(Array.from({ length: 10 }, () => completeAttempt(client, activity.id, 1, answers)));
    expect(results.map((res) => res.status)).toEqual(Array(10).fill(200));
    expect(new Set(results.map((res) => res.body.lastResult.completedAt)).size).toBe(1);
    expect(await events("exercise_attempt.completed")).toBe(1);
    expect(await t.prisma.exerciseQuestionResult.findMany({ select: { scoring: true, points: true } })).toEqual([{ scoring: true, points: 60 }]);
  });

  it("013/SC-003 10 \"Refazer\" simultâneos → uma tentativa nova e um evento", async () => {
    const { activity } = await exerciseActivity([{ type: "OPEN_ANSWER", difficulty: "BASIC" }]);
    await startAttempt(client, activity.id);
    expect((await completeAttempt(client, activity.id, 1)).status).toBe(200);
    const started = await events("activity_attempt.started");
    const results = await Promise.all(Array.from({ length: 10 }, () => retryAttempt(client, activity.id, 1)));
    expect(results.map((res) => res.status)).toEqual(Array(10).fill(200));
    expect(new Set(results.map((res) => res.body.attempt.number))).toEqual(new Set([2]));
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(2);
    expect(await events("activity_attempt.started")).toBe(started + 1);
  });

  it("013/SC-003 013/FR-010a duas atividades com o mesmo exercício concluídas ao mesmo tempo → um só scoring", async () => {
    for (let round = 0; round < 3; round += 1) {
      const exercise = await createExercise(t, teacher.id, { difficulty: "INTERMEDIATE" });
      const first = await exerciseActivity([{ type: "MULTIPLE_CHOICE", difficulty: "INTERMEDIATE", sourceExerciseId: exercise.id }]);
      const second = await exerciseActivity([{ type: "MULTIPLE_CHOICE", difficulty: "INTERMEDIATE", sourceExerciseId: exercise.id }]);
      for (const created of [first, second]) await startAttempt(client, created.activity.id);
      const answer = (created: CreatedActivity) => [
        { questionId: created.questionIds[0]!, answer: { kind: "ALTERNATIVE" as const, alternativeId: created.correctAlternativeIds[0]! }, baseRevision: 0 },
      ];
      const [a, b] = await Promise.all([completeAttempt(client, first.activity.id, 1, answer(first)), completeAttempt(client, second.activity.id, 1, answer(second))]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const rows = await t.prisma.exerciseQuestionResult.findMany({
        where: { sourceExerciseId: exercise.id },
        select: { scoring: true, points: true, result: true },
      });
      expect(rows.filter((row) => row.scoring)).toEqual([{ scoring: true, points: 30, result: "CORRECT" }]);
      expect(rows.filter((row) => !row.scoring)).toEqual([{ scoring: false, points: 0, result: "CORRECT" }]);
      const alreadyScored = [a, b].map((res) => res.body.lastResult.questions[0].alreadyScored).sort();
      expect(alreadyScored).toEqual([false, true]);
    }
  });

  it("013/SC-003 salvar × concluir: o salvamento entra antes da conclusão ou é recusado, e a conclusão fica consistente", async () => {
    for (let round = 0; round < 3; round += 1) {
      const { activity, questionIds } = await exerciseActivity([{ type: "OPEN_ANSWER", difficulty: "BASIC" }]);
      await startAttempt(client, activity.id);
      await saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("v1"), baseRevision: 0 }]);
      const [save, complete] = await Promise.all([
        saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("v2"), baseRevision: 1 }]),
        completeAttempt(client, activity.id, 1, []),
      ]);
      expect(complete.status).toBe(200);
      const stored = await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: questionIds[0]! } });
      if (save.status === 200) expect(stored.text).toBe("v2");
      else {
        expect(save.status).toBe(409);
        expect(stored.text).toBe("v1");
      }
      // The conclusion shows exactly what was stored.
      expect(complete.body.lastResult.questions[0].answer).toEqual(text(stored.text!));
      const late = await saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("v3"), baseRevision: stored.revision }]);
      expect(late.status).toBe(409);
      expect((await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: questionIds[0]! } })).text).toBe(stored.text);
    }
  });

  it("013/SC-003 marcar × cancelar: ou a marcação entra e deixa de contar com o cancelamento, ou é recusada e nada muda", async () => {
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    for (let round = 0; round < 3; round += 1) {
      const { activity, questionIds } = await exerciseActivity([{ type: "OPEN_ANSWER", difficulty: "ADVANCED" }]);
      await startAttempt(client, activity.id);
      await completeAttempt(client, activity.id, 1, [{ questionId: questionIds[0]!, answer: text("Resposta"), baseRevision: 0 }]);
      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } });
      const marked = await events("exercise_result.marked");
      const base = `/api/classes/${schoolClass.id}/activities/${activity.id}`;
      const [mark, cancel] = await Promise.all([
        teacherClient.put(`${base}/attempts/${attempt.id}/marks`, { marks: [{ questionId: questionIds[0]!, result: "CORRECT" }] }),
        teacherClient.post(`${base}/cancel`, {}),
      ]);
      expect(cancel.status).toBe(200);
      const row = await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId: attempt.id } });
      if (mark.status === 200) {
        expect([row.result, row.points]).toEqual(["CORRECT", 60]);
        expect(await events("exercise_result.marked")).toBe(marked + 1);
      } else {
        expect([mark.status, mark.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
        expect([row.result, row.points]).toEqual(["PENDING_TEACHER", 0]);
        expect(await events("exercise_result.marked")).toBe(marked);
      }
      // Either way, the cancelled activity's points don't count.
      const ranking = await teacherClient.get(`/api/classes/${schoolClass.id}/ranking`);
      expect(ranking.body.rows[0].points).toBe(0);
    }
  });
});
