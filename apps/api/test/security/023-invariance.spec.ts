import type { Answer, StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { completeAttempt, createActivity, createClassWithStudents, gradeAttempt, releaseResult, retryAttempt, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { declareExit, markPresent, pauseStudent, releasePause } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createCodeWork, createRunWorker, doubles, drainRuns, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

const text = (value: string): Answer => ({ kind: "TEXT", text: value });
/** Metadata keys 023 adds only to a group work (contracts/audit-events.md, research U19). */
const GROUP_KEYS = ["group", "memberCount", "groupSize", "submittedById"];

/**
 * 023/SC-007: an individual work, an exercise (013) and an exam (018) read exactly as before 023 — the start, the
 * saves, the submission, the grade, the 015 events, the 016 pauses and the 019/021 runs give the same answers and
 * the same audit events, each attempt has only its owner as a participant, and no group row exists.
 */
describe("023/SC-007 trabalho individual, exercício e prova iguais a antes da 023", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let schoolClass: SchoolClass;
  let student: TestUser;
  let studentClient: Client;

  const types = async () =>
    (await t.prisma.auditEvent.findMany({ where: { type: { startsWith: "activity" } }, orderBy: { id: "asc" }, select: { type: true } })).map(({ type }) => type);
  const expectNoGroupTrace = async (activityId: string, attempts: number) => {
    const participants = await t.prisma.attemptParticipant.findMany({ where: { activityId }, select: { studentUserId: true, addedByUserId: true, attemptNumber: true } });
    expect(participants).toHaveLength(attempts);
    expect(participants.every((row) => row.studentUserId === student.id && row.addedByUserId === null)).toBe(true);
    expect(await t.prisma.attemptGroup.count()).toBe(0);
    expect(await t.prisma.attemptGroupEvent.count()).toBe(0);
    const events = await t.prisma.auditEvent.findMany({ select: { type: true, metadata: true } });
    expect(events.filter(({ type }) => type.startsWith("activity_group."))).toEqual([]);
    for (const { type, metadata } of events) {
      for (const key of GROUP_KEYS) expect(Object.keys((metadata ?? {}) as object), type).not.toContain(key);
    }
    const started = await t.prisma.auditEvent.findMany({ where: { type: "activity_attempt.started" }, select: { metadata: true } });
    for (const { metadata } of started) expect(Object.keys(metadata as object).sort()).toEqual(expect.not.arrayContaining(GROUP_KEYS));
  };
  const read = async (activityId: string) => {
    const res = await studentClient.get(`/api/me/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentActivity;
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
    studentClient = api(t, { cookie: await loginAs(t, student) });
  });

  it("023/SC-007 trabalho individual: início, salvamento, eventos, pausa, execução, entrega, nota e resultado", async () => {
    const { activity, questionIds } = await createCodeWork(t, schoolClass, { releaseMode: "PRESENT_ONLY", executionMode: "CONTROLLED" });
    expect((await markPresent(teacherClient, schoolClass.id, activity.id, [student.id])).status).toBe(200);
    await seedHeartbeat(t, clock.now());
    const { worker } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) });

    const started = await startAttempt(studentClient, activity.id);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const view = started.body as StudentActivity;
    expect(view.group).toBeNull();
    expect(view.groupSize).toBeNull();
    const summaries = (await studentClient.get("/api/me/activities")).body;
    expect(JSON.stringify(summaries)).not.toContain("groupSize");

    // 015 events, recorded for the student.
    expect((await recordEvents(studentClient, activity.id, [integrityEvent("SCREEN_LEFT")])).status).toBeLessThan(300);
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { studentUserId: student.id } })).toBeGreaterThan(0);

    // 019/021: a run saves nothing.
    expect((await requestRun(studentClient, activity.id, questionIds[0]!, "print(int(input()) * 2)")).status).toBe(202);
    await drainRuns(worker);
    clock.advance(MINUTE);

    // The save, with no `savedBy` on an individual attempt.
    const code: Answer = { kind: "CODE", source: "print(1)" };
    const saved = await saveAnswers(studentClient, activity.id, [{ questionId: questionIds[0]!, answer: code, baseRevision: 0 }]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(JSON.stringify((await read(activity.id)).questions)).not.toContain("savedBy");

    // 016: the exit and the return.
    const exit = await declareExit(studentClient, activity.id, { reason: "WATER" });
    expect(exit.status).toBe(201);
    const refused = await saveAnswers(studentClient, activity.id, [{ questionId: questionIds[0]!, answer: code, baseRevision: 1 }]);
    expect([refused.status, refused.body.code]).toEqual([409, "ATTEMPT_PAUSED"]);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } });
    expect(exit.body.id).toBeTruthy();
    expect((await releasePause(teacherClient, schoolClass.id, activity.id, exit.body.id)).status).toBe(200);
    expect((await pauseStudent(teacherClient, schoolClass.id, activity.id, student.id)).status).toBeLessThan(300);
    const pause = await t.prisma.attemptPause.findFirstOrThrow({ where: { attemptId: attempt.id, releasedAt: null } });
    expect((await releasePause(teacherClient, schoolClass.id, activity.id, pause.id)).status).toBe(200);

    const submitted = await submitAttempt(studentClient, activity.id, []);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    const submission = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "activity_submission.created" } });
    expect(submission.metadata).toMatchObject({ activityId: activity.id, attemptId: attempt.id });

    await expectNoGroupTrace(activity.id, 1);
    expect(await types()).toEqual(expect.arrayContaining(["activity_attempt.started", "activity_submission.created"]));
    expect(await t.prisma.activityAnswerSave.count({ where: { attemptId: attempt.id, studentUserId: { not: student.id } } })).toBe(0);
  });

  it("023/SC-007 nota e resultado de um trabalho individual: uma entrega, um aluno", async () => {
    const { activity, questionIds } = await createActivity(t, schoolClass, { type: "ASSIGNMENT", questions: [{ type: "OPEN_ANSWER" }] });
    expect((await startAttempt(studentClient, activity.id)).status).toBe(200);
    const res = await submitAttempt(studentClient, activity.id, [{ questionId: questionIds[0]!, answer: text("minha resposta"), baseRevision: 0 }]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } });
    const { version } = await t.prisma.activitySubmission.findFirstOrThrow({ where: { attemptId: attempt.id } });
    const graded = await gradeAttempt(teacherClient, schoolClass.id, activity.id, attempt.id, { version, decisions: [{ questionId: questionIds[0]!, grade: "1.00" }] });
    expect(graded.status, JSON.stringify(graded.body)).toBe(200);
    expect((await releaseResult(teacherClient, schoolClass.id, activity.id)).status).toBe(200);
    expect((await read(activity.id)).result).toMatchObject({ grade: "1.00" });
    await expectNoGroupTrace(activity.id, 1);
  });

  it("023/SC-007 exercício: tentativas 1 e 2 do próprio aluno, sem grupo", async () => {
    const { activity } = await createActivity(t, schoolClass, { type: "EXERCISE", questions: [{ type: "OPEN_ANSWER" }] });
    const started = await startAttempt(studentClient, activity.id);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    expect((started.body as StudentActivity).group).toBeNull();
    expect((await completeAttempt(studentClient, activity.id, 1)).status).toBe(200);
    expect((await retryAttempt(studentClient, activity.id, 1)).status).toBeLessThan(300);
    await expectNoGroupTrace(activity.id, 2);
  });

  it("023/SC-007 prova: início com as regras, entrega e nenhum rastro de grupo; memberIds → 400", async () => {
    const { activity } = await createActivity(t, schoolClass, { type: "EXAM", publishAt: clock.now() });
    expect((await markPresent(teacherClient, schoolClass.id, activity.id, [student.id])).status).toBe(200);
    const bad = await studentClient.post(`/api/me/activities/${activity.id}/attempt`, { acceptRules: true, memberIds: [student.id] });
    expect(bad.status).toBe(400);
    const started = await startExam(studentClient, activity.id);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    expect((started.body as StudentActivity).group).toBeNull();
    expect((await submitAttempt(studentClient, activity.id, [])).status).toBe(200);
    await expectNoGroupTrace(activity.id, 1);
  });
});
