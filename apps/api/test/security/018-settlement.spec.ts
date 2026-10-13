import type { TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, getAttempt, releaseResult, saveAnswers, submitAttempt } from "../helpers/activities";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, holdByHand, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { getIntegritySummary, integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 018 research T5 — an expired exam attempt is settled on its next touch, whoever touches it: one
 * submission dated at the computed end (`TIME_EXPIRED`, or `ACTIVITY_CLOSED` when the teacher's close
 * came first), graded on the saved answers, and one `exam_attempt.time_expired` (SYSTEM). A second
 * touch finds it settled and writes nothing. A held attempt waits for the teacher (US5), never settled.
 * The exam monitor (US5) settles the same way; its suite covers it.
 */

const START = "2026-10-01T12:00:00.000Z";
type Client = ReturnType<typeof api>;

describe("018 acerto por tempo no próximo toque (research T5)", () => {
  let t: TestApp;
  let clock: FixedClock;
  let client: Client;
  let classId: string;
  let student: TestUser;
  let studentApi: Client;
  let activity: TeacherActivity;

  const at = (ms: number) => new Date(new Date(START).getTime() + ms);
  const path = () => `/api/classes/${classId}/activities/${activity.id}`;
  const attemptRow = () => t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: student.id } });
  const expiredEvents = () => t.prisma.auditEvent.findMany({ where: { type: "exam_attempt.time_expired" } });

  /** Each way an attempt can be touched, by the student or the teacher. */
  const TOUCHES: [string, () => Promise<unknown>][] = [
    ["leitura do aluno", () => studentApi.get(`/api/me/activities/${activity.id}`)],
    ["lista do aluno", () => studentApi.get("/api/me/activities")],
    ["painel do aluno", () => studentApi.get("/api/me/dashboard")],
    ["eventos", () => recordEvents(studentApi, activity.id, [integrityEvent("SCREEN_LEFT")])],
    ["salvar", () => saveAnswers(studentApi, activity.id, [mcAnswer()])],
    ["entregar", () => submitAttempt(studentApi, activity.id)],
    ["roster do professor", () => client.get(path())],
    ["lista do professor", () => client.get(`/api/classes/${classId}/activities`)],
    ["revisão da tentativa", async () => getAttempt(client, classId, activity.id, (await attemptRow()).id)],
    ["revisão de integridade", () => getIntegritySummary(client, classId, activity.id)],
    ["liberação", () => releaseResult(client, classId, activity.id)],
  ];
  const mcAnswer = () => {
    const question = activity.questions.find((item) => item.type === "MULTIPLE_CHOICE")!;
    return { questionId: question.id, answer: { kind: "ALTERNATIVE" as const, alternativeId: question.alternatives.find((a) => a.isCorrect)!.id }, baseRevision: 0 };
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
    client = api(t, { cookie: await loginAs(t, teacher) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 1 });
    classId = created.schoolClass.id;
    student = created.students[0]!;
    studentApi = api(t, { cookie: await loginAs(t, student) });
    const exam = await approvedExam(t, client, syllabus);
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, durationMinutes: 10 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    activity = res.body as TeacherActivity;
    expect((await startExam(studentApi, activity.id)).status).toBe(200);
    clock.set(at(2 * MINUTE).toISOString());
    expect((await saveAnswers(studentApi, activity.id, [mcAnswer()])).status).toBe(200);
  });

  it.each(TOUCHES)("018/SC-008 o toque \"%s\" acerta a tentativa expirada uma única vez, datada no fim calculado", async (_name, touch) => {
    clock.set(at(45 * MINUTE).toISOString());
    await touch();
    await touch();
    for (const [, other] of TOUCHES) await other();

    const submissions = await t.prisma.activitySubmission.findMany({ where: { activityId: activity.id } });
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({ endReason: "TIME_EXPIRED", late: false, blankCount: 2, gradePartial: false });
    expect(submissions[0]!.submittedAt.toISOString()).toBe(at(10 * MINUTE).toISOString());
    expect(submissions[0]!.grade.toFixed(2)).toBe("3.33");
    const audited = await expiredEvents();
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({ actorType: "SYSTEM", targetType: "ACTIVITY_ATTEMPT", targetId: (await attemptRow()).id });
    expect(audited[0]!.metadata).toEqual({ activityId: activity.id, submissionId: submissions[0]!.id, endReason: "TIME_EXPIRED", blankCount: 2 });
  });

  it("018/FR-013 antes do fim + 2 s nenhum toque acerta a tentativa", async () => {
    clock.set(at(10 * MINUTE + 1999).toISOString());
    for (const [name, touch] of TOUCHES.filter(([name]) => !["eventos", "salvar", "entregar", "liberação"].includes(name))) {
      await touch();
      expect((await attemptRow()).status, name).toBe("IN_PROGRESS");
    }
    expect(await expiredEvents()).toHaveLength(0);
  });

  it("018/FR-011 o encerramento da atividade pelo professor antecipa o fim: a tentativa é acertada como ACTIVITY_CLOSED, datada no encerramento", async () => {
    clock.set(at(4 * MINUTE).toISOString());
    expect((await client.post(`${path()}/close`, {})).status).toBe(200);
    clock.set(at(4 * MINUTE + 5000).toISOString());
    await studentApi.get(`/api/me/activities/${activity.id}`);
    const submission = await t.prisma.activitySubmission.findFirstOrThrow({ where: { activityId: activity.id } });
    expect(submission).toMatchObject({ endReason: "ACTIVITY_CLOSED", late: false });
    expect(submission.submittedAt.toISOString()).toBe(at(4 * MINUTE).toISOString());
    expect((await expiredEvents())[0]!.metadata).toMatchObject({ endReason: "ACTIVITY_CLOSED" });
  });

  it("018/FR-019 uma tentativa retida não é acertada por tempo: espera a decisão do professor", async () => {
    clock.set(at(3 * MINUTE).toISOString());
    await holdByHand(t, await attemptRow(), at(3 * MINUTE));
    clock.set(at(45 * MINUTE).toISOString());
    for (const [, touch] of TOUCHES) await touch();
    expect((await attemptRow()).status).toBe("IN_PROGRESS");
    expect(await t.prisma.activitySubmission.count({ where: { activityId: activity.id } })).toBe(0);
    expect(await expiredEvents()).toHaveLength(0);
  });
});
