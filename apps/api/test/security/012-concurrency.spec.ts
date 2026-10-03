import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type CreatedActivity, createActivity, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

/**
 * 012/SC-006, FR-016, FR-025 — under simultaneous requests: one attempt, one submission, one event;
 * a save racing the submission never changes it; close and submit serialize; two tabs saving the
 * same question converge on SAVED + CONFLICT. (The teacher's concurrent acceptance arrives with its
 * route, T048a.)
 */

const START = "2026-10-01T12:00:00.000Z";

describe("012/SC-006 concorrência de iniciar, salvar e entregar", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let client: ReturnType<typeof api>;
  let schoolClass: SchoolClass;

  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const openActivity = (): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      publishAt: new Date(clock.now().getTime() - DAY),
      deadline: new Date(clock.now().getTime() + 7 * DAY),
      questions: [
        { type: "OPEN_ANSWER", valueCents: 50 },
        { type: "MULTIPLE_CHOICE", valueCents: 50 },
      ],
    });
  const events = (type: string) => t.prisma.auditEvent.count({ where: { type } });

  beforeAll(async () => {
    clock = new FixedClock(START);
    // Many requests in a burst: the per-student limits stay out of the way here (012-rate-limits covers them).
    const base = testConfig();
    t = await createTestApp({ clock, config: { rateLimit: { ...base.rateLimit, activitySubmitsPerHour: 1_000, activitySavesPerMinute: 1_000 } } });
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

  it("012/SC-006 012/FR-016 10 inícios simultâneos → uma tentativa e um evento", async () => {
    const { activity } = await openActivity();
    const results = await Promise.all(Array.from({ length: 10 }, () => startAttempt(client, activity.id)));
    expect(results.map((res) => res.status)).toEqual(Array(10).fill(200));
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(1);
    expect(await events("activity_attempt.started")).toBe(1);
  });

  it("012/SC-006 012/FR-025 10 entregas simultâneas → uma entrega e um evento, todas com a mesma entrega", async () => {
    const { activity, questionIds } = await openActivity();
    await startAttempt(client, activity.id);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => submitAttempt(client, activity.id, [{ questionId: questionIds[0]!, answer: text("final"), baseRevision: 0 }])),
    );
    expect(results.map((res) => res.status)).toEqual(Array(10).fill(200));
    expect(new Set(results.map((res) => res.body.submission.submittedAt)).size).toBe(1);
    expect(await t.prisma.activitySubmission.count()).toBe(1);
    expect(await events("activity_submission.created")).toBe(1);
    expect(await t.prisma.activityQuestionGrading.count()).toBe(2);
  });

  it("012/US4-3 salvamento concorrente com a entrega: a entrega fica consistente e o salvamento é anterior ou recusado", async () => {
    const { activity, questionIds } = await openActivity();
    await startAttempt(client, activity.id);
    await saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("v1"), baseRevision: 0 }]);

    const [save, submit] = await Promise.all([
      saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("v2"), baseRevision: 1 }]),
      submitAttempt(client, activity.id, []),
    ]);
    expect(submit.status).toBe(200);
    const stored = await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: questionIds[0]! } });
    if (save.status === 200) {
      // The save landed first: the submission carries it.
      expect(stored.text).toBe("v2");
    } else {
      expect([save.status, save.body.code]).toEqual([409, "ATTEMPT_ALREADY_SUBMITTED"]);
      expect(stored.text).toBe("v1");
    }
    // Nothing changes the submitted answers afterwards.
    const late = await saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("v3"), baseRevision: stored.revision }]);
    expect(late.body.code).toBe("ATTEMPT_ALREADY_SUBMITTED");
  });

  it("012/FR-004 encerrar × entregar serializados: ou a entrega existe e conta, ou é recusada com ACTIVITY_CLOSED", async () => {
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    for (let round = 0; round < 3; round += 1) {
      const { activity } = await openActivity();
      await startAttempt(client, activity.id);
      const [close, submit] = await Promise.all([
        teacherClient.post(`/api/classes/${schoolClass.id}/activities/${activity.id}/close`, {}),
        submitAttempt(client, activity.id, []),
      ]);
      expect(close.status).toBe(200);
      const submissions = await t.prisma.activitySubmission.count({ where: { activityId: activity.id } });
      if (submit.status === 200) {
        expect(submissions).toBe(1);
        const closed = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "activity.closed", targetId: activity.id } });
        // The close ran after the submission committed (or before it, in which case the submit failed).
        expect((closed.metadata as { submittedCount: number }).submittedCount).toBe(1);
      } else {
        expect([submit.status, submit.body.code]).toEqual([409, "ACTIVITY_CLOSED"]);
        expect(submissions).toBe(0);
      }
    }
  });

  it("012/FR-017 duas abas salvando a mesma questão com a mesma revisão → uma SAVED e uma CONFLICT", async () => {
    const { activity, questionIds } = await openActivity();
    await startAttempt(client, activity.id);
    const [a, b] = await Promise.all([
      saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("aba A"), baseRevision: 0 }]),
      saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("aba B"), baseRevision: 0 }]),
    ]);
    const outcomes = [a.body.results[0].outcome, b.body.results[0].outcome].sort();
    expect(outcomes).toEqual(["CONFLICT", "SAVED"]);
    const stored = await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: questionIds[0]! } });
    expect(stored.revision).toBe(1);
    const conflict = [a, b].find((res) => res.body.results[0].outcome === "CONFLICT")!;
    expect(conflict.body.results[0].answer).toEqual(text(stored.text!));
  });

  it("012/FR-025 entrega de uma aba com revisão antiga depois de a outra salvar → ANSWER_CHANGED_ELSEWHERE", async () => {
    const { activity, questionIds } = await openActivity();
    await startAttempt(client, activity.id);
    await saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("aba A"), baseRevision: 0 }]);
    const res = await submitAttempt(client, activity.id, [{ questionId: questionIds[0]!, answer: text("aba B"), baseRevision: 0 }]);
    expect([res.status, res.body.code]).toEqual([409, "ANSWER_CHANGED_ELSEWHERE"]);
    expect(await t.prisma.activitySubmission.count()).toBe(0);
  });
});
