import type { RecordIntegrityEventsResult, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { applyExam, approvedExam, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 018/SC-004 — the warnings 1, 2 and 3, then the hold exactly once, also under concurrency (research
 * T6): each events batch of an exam takes the attempt `FOR UPDATE`, so concurrent batches serialize,
 * the ordinals have no gap, one hold opens and `exam_attempt.held` is written once.
 */

const START = "2026-10-01T12:00:00.000Z";
const SECOND = 1000;
type Client = ReturnType<typeof api>;

describe("018/SC-004 avisos 1, 2 e 3 e um único encerramento, mesmo com 10 ocorrências simultâneas", () => {
  let t: TestApp;
  let clock: FixedClock;
  let student: TestUser;
  let activity: TeacherActivity;
  let attemptId: string;
  let sessions: Client[];

  const ordinals = async () => (await t.prisma.examOccurrence.findMany({ where: { attemptId }, orderBy: { ordinal: "asc" } })).map((row) => row.ordinal);
  const expectOneHold = async () => {
    expect(await t.prisma.examAttemptHold.count({ where: { attemptId } })).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "exam_attempt.held", targetId: attemptId } })).toBe(1);
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 1 });
    student = created.students[0]!;
    const exam = await approvedExam(t, client, syllabus);
    const res = await applyExam(client, created.schoolClass.id, exam.id, { acknowledgeOutOfScope: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    activity = res.body as TeacherActivity;
    // Several devices and tabs of the same student.
    sessions = await Promise.all(Array.from({ length: 3 }, async () => api(t, { cookie: await loginAs(t, student) })));
    expect((await startExam(sessions[0]!, activity.id)).status).toBe(200);
    attemptId = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } })).id;
  });

  it("018/SC-004 as três primeiras ocorrências dão os avisos 1, 2 e 3; a 4ª encerra", async () => {
    const counts: RecordIntegrityEventsResult["exam"][] = [];
    for (const type of ["SCREEN_LEFT", "PASTE_BLOCKED", "FULLSCREEN_EXITED", "SCREEN_LEFT"] as const) {
      clock.advance(5 * SECOND);
      const res = await recordEvents(sessions[0]!, activity.id, [integrityEvent(type, type === "PASTE_BLOCKED" ? { questionId: activity.questions[0]!.id } : {})]);
      expect(res.status).toBe(200);
      counts.push(res.body.exam);
    }
    expect(counts).toEqual([
      { occurrenceCount: 1, held: false },
      { occurrenceCount: 2, held: false },
      { occurrenceCount: 3, held: false },
      { occurrenceCount: 4, held: true },
    ]);
    await expectOneHold();
  });

  it("018/SC-004 10 lotes simultâneos depois do 3º aviso: ordinais sem lacuna, uma retenção, um evento de auditoria", async () => {
    for (let i = 0; i < 3; i += 1) {
      clock.advance(5 * SECOND);
      expect((await recordEvents(sessions[0]!, activity.id, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
    }
    clock.advance(5 * SECOND);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) => recordEvents(sessions[index % sessions.length]!, activity.id, [integrityEvent(index % 2 ? "SCREEN_LEFT" : "COPY_BLOCKED")])),
    );
    expect(results.map((res) => res.status)).toEqual(Array(10).fill(200));
    expect(await ordinals()).toEqual([1, 2, 3, 4]);
    await expectOneHold();
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId } })).toBe(13);
  });

  it("018/SC-004 10 lotes simultâneos guardados sem conexão, cada um com 4 ocorrências: só o primeiro conta, e encerra uma vez", async () => {
    clock.advance(10 * SECOND);
    const batch = () =>
      [40, 30, 20, 10].map((secondsAgo) =>
        integrityEvent("SCREEN_LEFT", { buffered: true, clientOccurredAt: new Date(clock.now().getTime() - secondsAgo * SECOND).toISOString() }),
      );
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => recordEvents(sessions[index % sessions.length]!, activity.id, batch())));
    expect(results.map((res) => res.status)).toEqual(Array(10).fill(200));
    expect(results.map((res) => res.body.exam)).toContainEqual({ occurrenceCount: 4, held: true });
    expect(await ordinals()).toEqual([1, 2, 3, 4]);
    await expectOneHold();
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId } })).toBe(40);
  });
});
