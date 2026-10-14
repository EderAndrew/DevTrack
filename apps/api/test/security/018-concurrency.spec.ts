import type { ExamMonitor, RecordIntegrityEventsResult, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, releaseResult } from "../helpers/activities";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, decideHold, getExamMonitor, startExam } from "../helpers/exams";
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

/**
 * 018/SC-005, SC-006, SC-007 — the teacher's decisions under concurrency (research T9, T10): each takes
 * the activity `FOR SHARE`, the attempt and the hold `FOR UPDATE`, so a hold gets exactly one
 * resolution and one event; a return never lands after the end; the release (activity `FOR UPDATE`)
 * waits for the decisions and never passes an open hold. The clock starts at the real time: the
 * hold's trigger checks a return against the database clock.
 */
describe("018/SC-005 018/SC-006 018/SC-007 decisões concorrentes", () => {
  const REAL_START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();
  let t: TestApp;
  let clock: FixedClock;
  let teacher: Client;
  let classId: string;
  let activity: TeacherActivity;
  let student: Client;
  let attemptId: string;
  let holdId: string;
  let startedAt: Date;

  const decisionEvents = () =>
    t.prisma.auditEvent.count({ where: { targetId: attemptId, type: { in: ["exam_attempt.cancel_confirmed", "exam_attempt.returned", "exam_attempt.not_cancelled"] } } });

  beforeAll(async () => {
    clock = new FixedClock(REAL_START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(REAL_START);
    const owner = await createUser(t, { roles: ["TEACHER"] });
    teacher = api(t, { cookie: await loginAs(t, owner) });
    const syllabus = await createConfirmedSyllabus(t, owner.id);
    const created = await createClassWithStudents(t, owner.id, { subjectId: syllabus.subject.id, students: 1 });
    classId = created.schoolClass.id;
    const exam = await approvedExam(t, teacher, syllabus);
    const res = await applyExam(teacher, classId, exam.id, { acknowledgeOutOfScope: true, durationMinutes: 30 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    activity = res.body as TeacherActivity;
    student = api(t, { cookie: await loginAs(t, created.students[0]!) });
    expect((await startExam(student, activity.id)).status).toBe(200);
    for (let i = 0; i < 4; i += 1) {
      clock.advance(5 * SECOND);
      expect((await recordEvents(student, activity.id, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
    }
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } });
    [attemptId, startedAt] = [attempt.id, attempt.startedAt];
    holdId = (await t.prisma.examAttemptHold.findFirstOrThrow({ where: { attemptId, resolution: null } })).id;
  });

  it("018/SC-007 a retenção aparece no monitor na sondagem seguinte e se decide com uma ação", async () => {
    const view = (await getExamMonitor(teacher, classId, activity.id)).body as ExamMonitor;
    expect(view.students[0]).toMatchObject({ examStatus: "AWAITING_DECISION", openHold: { id: holdId, canReturn: true } });
    expect((await decideHold(teacher, classId, activity.id, holdId, "cancel")).status).toBe(200);
    expect(((await getExamMonitor(teacher, classId, activity.id)).body as ExamMonitor).students[0]!.examStatus).toBe("CANCELLED");
  });

  it("018/SC-005 decisão × decisão: 10 cliques em duas abas resolvem a retenção uma vez, com um evento", async () => {
    const decisions = ["cancel", "return"] as const;
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => decideHold(teacher, classId, activity.id, holdId, decisions[index % 2]!)));
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(results.filter((res) => res.status !== 200).map((res) => [res.status, res.body.code])).toEqual(Array(9).fill([409, "INVALID_STATE_TRANSITION"]));
    expect(await decisionEvents()).toBe(1);
    const hold = await t.prisma.examAttemptHold.findUniqueOrThrow({ where: { id: holdId } });
    const submissions = await t.prisma.activitySubmission.findMany({ where: { attemptId } });
    // SC-005: a zero exists only with the teacher's recorded cancellation.
    expect(submissions.map((row) => row.endReason)).toEqual(hold.resolution === "CANCEL_CONFIRMED" ? ["CANCELLED"] : []);
  });

  it("018/SC-006 devolver × fim do tempo: depois do fim a devolução é recusada e a leitura concorrente não acerta a tentativa retida", async () => {
    clock.set(new Date(startedAt.getTime() + 30 * MINUTE).toISOString());
    const [returned, ...reads] = await Promise.all([
      decideHold(teacher, classId, activity.id, holdId, "return"),
      getExamMonitor(teacher, classId, activity.id),
      student.get(`/api/me/activities/${activity.id}`),
    ]);
    expect([returned.status, returned.body.code]).toEqual([409, "EXAM_TIME_OVER"]);
    expect(reads.map((res) => res.status)).toEqual([200, 200]);
    expect(await t.prisma.activitySubmission.count({ where: { attemptId } })).toBe(0);
    expect(await decisionEvents()).toBe(0);
    // Still decidable: "Não cancelar".
    expect((await decideHold(teacher, classId, activity.id, holdId, "keep")).status).toBe(200);
  });

  it("018/SC-006 devolver × fim do tempo: devolvida a 1 s do fim, a próxima leitura após o fim acerta pelo tempo", async () => {
    clock.set(new Date(startedAt.getTime() + 30 * MINUTE - SECOND).toISOString());
    expect((await decideHold(teacher, classId, activity.id, holdId, "return")).status).toBe(200);
    clock.advance(3 * SECOND);
    const reads = await Promise.all([getExamMonitor(teacher, classId, activity.id), student.get(`/api/me/activities/${activity.id}`)]);
    expect(reads.map((res) => res.status)).toEqual([200, 200]);
    const submissions = await t.prisma.activitySubmission.findMany({ where: { attemptId } });
    expect(submissions.map((row) => row.endReason)).toEqual(["TIME_EXPIRED"]);
    expect(await t.prisma.auditEvent.count({ where: { type: "exam_attempt.time_expired", targetId: attemptId } })).toBe(1);
  });

  it("018/SC-005 cancelar × liberação: a liberação nunca passa por uma retenção aberta", async () => {
    const [cancelled, released] = await Promise.all([
      decideHold(teacher, classId, activity.id, holdId, "cancel"),
      releaseResult(teacher, classId, activity.id),
    ]);
    expect(cancelled.status).toBe(200);
    if (released.status === 200) {
      // The release came second: the hold was already decided when it read the pending count.
      const [hold, header] = await Promise.all([
        t.prisma.examAttemptHold.findUniqueOrThrow({ where: { id: holdId } }),
        t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } }),
      ]);
      expect(hold.resolvedAt!.getTime()).toBeLessThanOrEqual(header.resultReleasedAt!.getTime());
    } else {
      expect([released.status, released.body.code]).toEqual([409, "EXAM_DECISIONS_PENDING"]);
      expect((await releaseResult(teacher, classId, activity.id)).status).toBe(200);
    }
    expect(await decisionEvents()).toBe(1);
  });
});
