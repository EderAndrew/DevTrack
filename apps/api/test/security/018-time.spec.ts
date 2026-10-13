import type { StudentActivity, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, saveAnswers, submitAttempt } from "../helpers/activities";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 018/SC-002 — the server's clock is the only authority on an exam's time (research T4): nothing is
 * accepted after the computed end (saves and the submit get the 2 s network grace, events none), a
 * refused write stores nothing, and the remaining time a reload shows is the server's.
 */

const START = "2026-10-01T12:00:00.000Z";
const SECOND = 1000;
type Client = ReturnType<typeof api>;

describe("018/SC-002 nada é aceito depois do fim calculado pelo servidor", () => {
  let t: TestApp;
  let clock: FixedClock;
  let client: Client;
  let classId: string;
  let student: TestUser;
  /** Marked present, never started. */
  let lateStudent: TestUser;
  let studentApi: Client;
  let activity: TeacherActivity;

  const at = (ms: number) => new Date(new Date(START).getTime() + ms);
  const mcAnswer = (baseRevision: number) => {
    const question = activity.questions.find((item) => item.type === "MULTIPLE_CHOICE")!;
    return [{ questionId: question.id, answer: { kind: "ALTERNATIVE" as const, alternativeId: question.alternatives[0]!.id }, baseRevision }];
  };
  const stored = async () => ({
    answers: await t.prisma.activityAnswer.count({ where: { activityId: activity.id } }),
    events: await t.prisma.attemptIntegrityEvent.count({ where: { activityId: activity.id } }),
  });

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
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    classId = created.schoolClass.id;
    [student, lateStudent] = created.students as [TestUser, TestUser];
    studentApi = api(t, { cookie: await loginAs(t, student) });
    const exam = await approvedExam(t, client, syllabus);
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, durationMinutes: 10, startWindowMinutes: 5 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    activity = res.body as TeacherActivity;
    expect((await startExam(studentApi, activity.id)).status).toBe(200);
  });

  it("018/SC-002 eventos a partir do fim são recusados com 409 sem tolerância, e nada é gravado", async () => {
    clock.set(at(10 * MINUTE - 1).toISOString());
    expect((await recordEvents(studentApi, activity.id, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
    const before = await stored();

    for (const offset of [0, 1500, 5 * SECOND]) {
      clock.set(at(10 * MINUTE + offset).toISOString());
      const res = await recordEvents(studentApi, activity.id, [integrityEvent("SCREEN_RETURNED")]);
      expect({ status: res.status, code: res.body.code }, `+${offset} ms`).toEqual({ status: 409, code: "EXAM_TIME_OVER" });
    }
    expect(await stored()).toEqual(before);
  });

  it("018/SC-002 salvar e entregar: aceitos até o fim + 2 s, recusados a partir daí sem gravar nada", async () => {
    clock.set(at(10 * MINUTE + 1999).toISOString());
    expect((await saveAnswers(studentApi, activity.id, mcAnswer(0))).status).toBe(200);
    const before = await stored();

    clock.set(at(10 * MINUTE + 2 * SECOND).toISOString());
    for (const res of [await saveAnswers(studentApi, activity.id, mcAnswer(1)), await submitAttempt(studentApi, activity.id, mcAnswer(1))]) {
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: "EXAM_TIME_OVER" });
    }
    expect(await stored()).toEqual(before);
    const answer = await t.prisma.activityAnswer.findFirstOrThrow({ where: { activityId: activity.id } });
    expect(answer.revision).toBe(1);
    const submission = await t.prisma.activitySubmission.findFirstOrThrow({ where: { activityId: activity.id } });
    expect(submission).toMatchObject({ endReason: "TIME_EXPIRED", blankCount: 2 });
  });

  it("018/SC-002 iniciar depois do limite para iniciar é recusado (409) e nenhuma tentativa é criada; quem já iniciou recebe a mesma tentativa", async () => {
    const lateApi = api(t, { cookie: await loginAs(t, lateStudent) });
    clock.set(at(5 * MINUTE + 1).toISOString());
    const refused = await startExam(lateApi, activity.id);
    expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 409, code: "EXAM_START_CLOSED" });
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id, studentUserId: lateStudent.id } })).toBe(0);
    // The window only gates new attempts.
    expect((await startExam(studentApi, activity.id)).status).toBe(200);
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(1);
  });

  it("018/SC-002 o tempo restante depois de uma recarga é o do servidor, com 0 s de diferença sobre o fim", async () => {
    for (const elapsed of [0, 3 * MINUTE + 17 * SECOND, 9 * MINUTE + 59 * SECOND]) {
      clock.set(at(elapsed).toISOString());
      const view = (await studentApi.get(`/api/me/activities/${activity.id}`)).body as StudentActivity;
      const remaining = new Date(view.exam!.endsAt!).getTime() - new Date(view.serverNow).getTime();
      expect(remaining).toBe(10 * MINUTE - elapsed);
    }
  });
});
