import type { ExamMonitor, IntegrityTimeline } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createAttemptRow, releaseResult, submitAttempt } from "../helpers/activities";
import { pauseStudent } from "../helpers/attendance";
import { FixedClock } from "../helpers/clock";
import { createNudge, dismissByHand, monitorPath, type NudgeScene, nudgeScene, occur, roomRow, sendNudge } from "../helpers/exam-nudges";
import { loginAs } from "../helpers/factories";
import { getOwnIntegrity, getTimeline } from "../helpers/integrity";
import { mobileApi } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 025/US3 (research N9, contracts/http-api.md): the teacher reads the warnings in the timeline (the app's student
 * detail and the web review, one route), with their times and the derived status, and in the monitor (pending and
 * count); a work has none; the student never reads them.
 */
describe("025/US3 professor acompanha os avisos na sala, na linha do tempo e na revisão", () => {
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

  const teacherWeb = async (scene: NudgeScene) => api(t, { cookie: await loginAs(t, scene.teacher) });

  const timelineOf = async (client: ReturnType<typeof api>, scene: NudgeScene): Promise<IntegrityTimeline> => {
    const res = await getTimeline(client, scene.classId, scene.activityId, scene.attemptId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as IntegrityTimeline;
  };

  /** Two warnings: the first closed by the student 10 s after it was sent, the second still pending. */
  const twoNudges = async () => {
    const scene = await nudgeScene(t, clock);
    const first = await sendNudge(t, scene);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const firstSentAt = clock.now();
    clock.advance(10_000);
    const firstDismissedAt = clock.now();
    await dismissByHand(t, first.body.nudge.id, firstDismissedAt);
    clock.advance(10_000);
    const second = await sendNudge(t, scene);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    const secondSentAt = clock.now();
    clock.advance(5_000);
    return {
      scene,
      first: { id: first.body.nudge.id as string, sentAt: firstSentAt.toISOString(), dismissedAt: firstDismissedAt.toISOString() },
      second: { id: second.body.nudge.id as string, sentAt: secondSentAt.toISOString() },
    };
  };

  it("025/US3-1 a linha do tempo traz os avisos em ordem de envio, DISMISSED e PENDING, e UNSEEN depois da entrega; igual no celular e na web", async () => {
    const { scene, first, second } = await twoNudges();
    const web = await teacherWeb(scene);
    const phone = mobileApi(t, scene.token);
    const expected = [
      { id: first.id, sentAt: first.sentAt, dismissedAt: first.dismissedAt, status: "DISMISSED" },
      { id: second.id, sentAt: second.sentAt, dismissedAt: null, status: "PENDING" },
    ];
    const fromWeb = await timelineOf(web, scene);
    expect(fromWeb.nudges).toEqual(expected);
    expect(await timelineOf(phone, scene)).toEqual(fromWeb);
    // The occurrences stay what they were: the warnings are not events of the attempt.
    expect(fromWeb.events.filter((event) => event.occurrenceOrdinal !== null)).toHaveLength(2);

    expect((await submitAttempt(scene.studentClient, scene.activityId)).status).toBe(200);
    const after = await timelineOf(web, scene);
    expect(after.nudges).toEqual([expected[0], { ...expected[1], status: "UNSEEN" }]);
    expect(await timelineOf(phone, scene)).toEqual(after);
  });

  it("025/US3-1 a linha do tempo de um trabalho tem nudges vazio", async () => {
    const scene = await nudgeScene(t, clock, { occurrences: 0 });
    const schoolClass = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: scene.classId } });
    const { activity } = await createActivity(t, schoolClass, { executionMode: "CONTROLLED" });
    const { attemptId } = await createAttemptRow(t, activity.id, scene.student.id, { startedAt: clock.now() });
    const res = await getTimeline(await teacherWeb(scene), scene.classId, activity.id, attemptId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.nudges).toEqual([]);
  });

  it("025/US3-2 o monitor traz pendingSince e sentCount do aluno, na web e no celular", async () => {
    const { scene, first, second } = await twoNudges();
    const row = await roomRow(t, scene);
    expect(row.nudge).toEqual({ canSend: false, pendingSince: second.sentAt, sentCount: 2, lastDismissedAt: first.dismissedAt });
    const web = await (await teacherWeb(scene)).get(monitorPath(scene.classId, scene.activityId));
    expect((web.body as ExamMonitor).students.find((one) => one.studentUserId === scene.student.id)!.nudge).toEqual(row.nudge);
    // US3-4: the warnings never count as occurrences.
    expect(row.occurrenceCount).toBe(2);
  });

  it("025/US3-3 depois do fim e da liberação, a revisão traz a mesma linha do tempo dos avisos", async () => {
    const { scene, first, second } = await twoNudges();
    expect((await submitAttempt(scene.studentClient, scene.activityId)).status).toBe(200);
    const web = await teacherWeb(scene);
    const before = await timelineOf(web, scene);
    const released = await releaseResult(web, scene.classId, scene.activityId);
    expect(released.status, JSON.stringify(released.body)).toBe(200);
    const after = await timelineOf(web, scene);
    expect(after).toEqual(before);
    expect(after.nudges.map((nudge) => [nudge.id, nudge.status])).toEqual([
      [first.id, "DISMISSED"],
      [second.id, "UNSEEN"],
    ]);
  });

  it("025/US3-5 as rotas do aluno não trazem nenhum campo de aviso, antes e depois do resultado liberado", async () => {
    const { scene, first, second } = await twoNudges();
    const leaks = (body: unknown) => {
      const text = JSON.stringify(body);
      return [/nudge/i.test(text), text.includes(first.id), text.includes(second.id)];
    };
    const detail = await scene.studentClient.get(`/api/me/activities/${scene.activityId}`);
    expect(detail.status).toBe(200);
    expect(leaks(detail.body)).toEqual([false, false, false]);
    const own = await getOwnIntegrity(scene.studentClient, scene.activityId);
    expect(own.status).toBe(200);
    expect(leaks(own.body)).toEqual([false, false, false]);

    expect((await submitAttempt(scene.studentClient, scene.activityId)).status).toBe(200);
    expect((await releaseResult(await teacherWeb(scene), scene.classId, scene.activityId)).status).toBe(200);
    for (const path of [`/api/me/activities/${scene.activityId}`, `/api/me/activities/${scene.activityId}/attempt/integrity`, "/api/me/activities"]) {
      const res = await scene.studentClient.get(path);
      expect(res.status, path).toBe(200);
      expect(leaks(res.body), path).toEqual([false, false, false]);
    }
  });

  it("025/SC-005 em 40 alunos com situações variadas, canSend é verdadeiro exatamente nos em andamento com 2+ ocorrências e sem pendente", async () => {
    const scene = await nudgeScene(t, clock, { occurrences: 0, classmates: 39 });
    const web = await teacherWeb(scene);
    const everyone = [{ student: scene.student, client: scene.studentClient, attemptId: scene.attemptId }, ...scene.classmates];
    // Each situation and whether the bell is enabled (FR-001, FR-003).
    const situations = ["NONE", "ONE", "TWO", "THREE", "PENDING", "DISMISSED", "PAUSED", "SUBMITTED", "HELD", "THREE"] as const;
    const occurrencesOf = { NONE: 0, ONE: 1, TWO: 2, THREE: 3, PENDING: 2, DISMISSED: 2, PAUSED: 2, SUBMITTED: 2, HELD: 4 } as const;
    const enabled = new Set(["TWO", "THREE", "DISMISSED"]);
    const expected = new Map<string, boolean>();
    for (const [index, one] of everyone.entries()) {
      const situation = situations[index % situations.length]!;
      await occur(clock, { studentClient: one.client, activityId: scene.activityId }, occurrencesOf[situation]);
      const nudgeTarget = { attemptId: one.attemptId, activityId: scene.activityId, teacher: scene.teacher };
      if (situation === "PENDING") await createNudge(t, nudgeTarget, { sentAt: clock.now() });
      if (situation === "DISMISSED") {
        const sentAt = clock.now();
        clock.advance(1_000);
        await createNudge(t, nudgeTarget, { sentAt, dismissedAt: clock.now() });
      }
      if (situation === "PAUSED") expect((await pauseStudent(web, scene.classId, scene.activityId, one.student.id)).status).toBe(201);
      if (situation === "SUBMITTED") expect((await submitAttempt(one.client, scene.activityId)).status).toBe(200);
      expected.set(one.student.id, enabled.has(situation));
    }
    const monitor = (await mobileApi(t, scene.token).get(monitorPath(scene.classId, scene.activityId))).body as ExamMonitor;
    expect(monitor.students).toHaveLength(40);
    const actual = new Map(monitor.students.map((row) => [row.studentUserId, row.nudge?.canSend ?? false]));
    expect(actual).toEqual(expected);
    // The app's bell agrees with the server's send: each enabled student is accepted, each other one refused.
    for (const one of everyone.slice(0, 10)) {
      const res = await sendNudge(t, { token: scene.token, classId: scene.classId, activityId: scene.activityId, attemptId: one.attemptId });
      expect(res.status === 201, one.student.id).toBe(expected.get(one.student.id));
    }
  });
});
