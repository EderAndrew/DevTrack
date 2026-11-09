import type { ExamMonitor } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { releaseResult, saveAnswers, submitAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { dismissNudge, monitorPath, nudgeScene, sendNudge } from "../helpers/exam-nudges";
import { loginAs } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { mobileApi } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 025/SC-003 (FR-013): a warning sent and dismissed never changes the exam's record. Two students of the same exam
 * act at the same server instants; only one gets and closes a warning. Their occurrences, counts, end, answers,
 * status and, after the hand-in and the release, their grade are the same (0 differences).
 */
describe("025/SC-003 o aviso nunca é ocorrência, nota ou tempo", () => {
  let t: TestApp;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
  });

  it("025/SC-003 duas tentativas iguais, uma com envio e fechamento: 0 diferenças", async () => {
    const scene = await nudgeScene(t, clock, { occurrences: 0, classmates: 1 });
    const other = scene.classmates[0]!;
    const both = [
      { student: scene.student, client: scene.studentClient, attemptId: scene.attemptId },
      { student: other.student, client: other.client, attemptId: other.attemptId },
    ];

    // The same answer saved at the same instant.
    const question = await t.prisma.classActivityQuestion.findFirstOrThrow({ where: { activityId: scene.activityId } });
    const alternative = await t.prisma.classActivityAlternative.findFirstOrThrow({ where: { questionId: question.id }, orderBy: { position: "asc" } });
    for (const one of both) {
      const saved = await saveAnswers(one.client, scene.activityId, [
        { questionId: question.id, answer: { kind: "ALTERNATIVE", alternativeId: alternative.id }, baseRevision: 0 },
      ]);
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    }

    // The same occurrences at the same instants.
    for (let i = 0; i < 2; i += 1) {
      for (const one of both) expect((await recordEvents(one.client, scene.activityId, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
      clock.advance(5_000);
    }
    const sent = await sendNudge(t, scene);
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    clock.advance(3_000);
    expect((await dismissNudge(scene.studentClient, scene.activityId, sent.body.nudge.id)).status).toBe(200);
    // One more occurrence each after the warning: still counted from the same ordinal.
    for (const one of both) {
      const res = await recordEvents(one.client, scene.activityId, [integrityEvent("FULLSCREEN_EXITED")]);
      expect(res.body.exam).toEqual({ occurrenceCount: 3, held: false });
    }
    clock.advance(5_000);

    const facts = async (one: (typeof both)[number]) => {
      const occurrences = await t.prisma.examOccurrence.findMany({
        where: { attemptId: one.attemptId },
        orderBy: { ordinal: "asc" },
        select: { ordinal: true, kind: true, recordedAt: true },
      });
      const events = await t.prisma.attemptIntegrityEvent.findMany({
        where: { attemptId: one.attemptId },
        orderBy: { recordedAt: "asc" },
        select: { type: true, recordedAt: true },
      });
      const holds = await t.prisma.examAttemptHold.count({ where: { attemptId: one.attemptId } });
      const pauses = await t.prisma.attemptPause.count({ where: { attemptId: one.attemptId } });
      const monitor = (await mobileApi(t, scene.token).get(monitorPath(scene.classId, scene.activityId))).body as ExamMonitor;
      const { studentUserId: _id, name: _name, attemptId: _attempt, nudge: _nudge, ...row } = monitor.students.find((item) => item.studentUserId === one.student.id)!;
      const attempt = await t.prisma.activityAttempt.findUniqueOrThrow({ where: { id: one.attemptId }, select: { status: true, startedAt: true } });
      const answers = await t.prisma.activityAnswer.findMany({
        where: { attemptId: one.attemptId },
        select: { questionId: true, questionType: true, text: true, alternativeId: true, savedAt: true },
      });
      return { occurrences, events, holds, pauses, row, attempt, answers };
    };
    expect(await facts(both[0]!)).toEqual(await facts(both[1]!));

    // The hand-in at the same instant, the release, and what each student reads afterwards.
    for (const one of both) expect((await submitAttempt(one.client, scene.activityId)).status).toBe(200);
    const teacher = api(t, { cookie: await loginAs(t, scene.teacher) });
    const released = await releaseResult(teacher, scene.classId, scene.activityId);
    expect(released.status, JSON.stringify(released.body)).toBe(200);

    const outcome = async (one: (typeof both)[number]) => {
      const submission = await t.prisma.activitySubmission.findUniqueOrThrow({
        where: { attemptId: one.attemptId },
        select: { submittedAt: true, late: true, blankCount: true, grade: true, gradePartial: true, endReason: true },
      });
      const detail = await one.client.get(`/api/me/activities/${scene.activityId}`);
      expect(detail.status).toBe(200);
      const view = JSON.stringify(detail.body).replaceAll(one.attemptId, "ATTEMPT");
      return { ...submission, grade: submission.grade.toFixed(2), view, facts: await facts(one) };
    };
    expect(await outcome(both[0]!)).toEqual(await outcome(both[1]!));
  });
});
