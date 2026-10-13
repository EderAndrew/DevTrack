import type { StudentActivity, TeacherActivity, TeacherExam } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { markPresent } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 018/US3 — the student takes the exam with the server's time (018/FR-011…FR-014, research T4, T5):
 * the rules accepted before the start, the start window, each student's own end (start + duration),
 * the 2 s grace for a save already on the network, the refusals after the end, and the attempt
 * settled on its next touch with the saved answers only (blanks score zero, no teacher action).
 * The alerts and the countdown are the web's (`018/US3-3`, `018/US3-4` in `features/exam-attempt`).
 */

const START = "2026-10-01T12:00:00.000Z";
const SECOND = 1000;
type Client = ReturnType<typeof api>;

describe("018/US3 aluno faz a prova com tempo controlado", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let exam: TeacherExam;

  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const at = (ms: number) => new Date(new Date(START).getTime() + ms);
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const detail = async (student: Client, activityId: string) => {
    const res = await student.get(`/api/me/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentActivity;
  };
  /** An exam applied now through the route (every student present unless `attendance: "NONE"`). */
  const applied = async (overrides: Parameters<typeof applyExam>[3] = {}) => {
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  const multipleChoice = (activity: TeacherActivity) => {
    const question = activity.questions.find((item) => item.type === "MULTIPLE_CHOICE")!;
    return { questionId: question.id, alternativeId: question.alternatives.find((alternative) => alternative.isCorrect)!.id };
  };
  const answerMultipleChoice = (student: Client, activity: TeacherActivity, baseRevision = 0) => {
    const { questionId, alternativeId } = multipleChoice(activity);
    return saveAnswers(student, activity.id, [{ questionId, answer: { kind: "ALTERNATIVE", alternativeId }, baseRevision }]);
  };
  const attemptOf = (activityId: string, studentUserId: string) =>
    t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId }, include: { submission: { include: { gradings: true } } } });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Ana Professora" });
    client = api(t, { cookie: await loginAs(t, teacher) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 3 });
    classId = created.schoolClass.id;
    students = created.students;
    exam = await approvedExam(t, client, syllabus);
  });

  it("018/US3-1 018/FR-011 as regras antes do início: sem aceitá-las o início é recusado; o aceite registra o início com o horário do servidor", async () => {
    const activity = await applied({ durationMinutes: 60, inactivityLimitSeconds: 45, startWindowMinutes: 15 });
    const student = await studentClient(students[0]!);

    const before = await detail(student, activity.id);
    expect(before.exam).toEqual({
      durationMinutes: 60,
      inactivityLimitSeconds: 45,
      startDeadline: at(15 * MINUTE).toISOString(),
      endsAt: null,
      occurrences: { count: 0, warningsAllowed: 3 },
      hold: null,
      endReason: null,
    });
    expect(before.attempt).toBeNull();

    clock.advance(3 * MINUTE);
    for (const body of [{}, { acceptRules: false }]) {
      const refused = await student.post(`/api/me/activities/${activity.id}/attempt`, body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
    }
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(0);

    const started = await startExam(student, activity.id);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const view = started.body as StudentActivity;
    expect(view.attempt?.startedAt).toBe(at(3 * MINUTE).toISOString());
    expect(view.exam).toMatchObject({ endsAt: at(63 * MINUTE).toISOString(), endReason: null });
    expect(view.serverNow).toBe(at(3 * MINUTE).toISOString());

    // A second click starts nothing new: same attempt, no second event.
    expect((await startExam(student, activity.id)).status).toBe(200);
    const startedEvents = (await events("activity_attempt.started")).filter((event) => event.actorUserId === students[0]!.id);
    expect(startedEvents).toHaveLength(1);
    expect(startedEvents[0]!.metadata).toMatchObject({ activityId: activity.id, afterDeadline: false, attemptNumber: 1, rulesAccepted: true });
  });

  it("018/US3-2 018/FR-012 recarregar ou trocar de dispositivo mostra o tempo restante do servidor: o mesmo fim, o horário atual do servidor", async () => {
    const activity = await applied({ durationMinutes: 30 });
    expect((await startExam(await studentClient(students[0]!), activity.id)).status).toBe(200);

    clock.advance(7 * MINUTE + 12 * SECOND);
    // Another login is another device: the end comes from the server's start, never the browser.
    const otherDevice = await detail(await studentClient(students[0]!), activity.id);
    expect(otherDevice.exam!.endsAt).toBe(at(30 * MINUTE).toISOString());
    expect(otherDevice.serverNow).toBe(at(7 * MINUTE + 12 * SECOND).toISOString());
    expect(new Date(otherDevice.exam!.endsAt!).getTime() - new Date(otherDevice.serverNow).getTime()).toBe(22 * MINUTE + 48 * SECOND);
  });

  it("018/US3-5 018/FR-013 esgotado o tempo, salvar e entregar são recusados com 409 e a tentativa fica encerrada por tempo", async () => {
    const activity = await applied({ durationMinutes: 1 });
    const student = await studentClient(students[0]!);
    expect((await startExam(student, activity.id)).status).toBe(200);
    expect((await answerMultipleChoice(student, activity)).status).toBe(200);

    clock.advance(MINUTE + 2 * SECOND);
    const save = await answerMultipleChoice(student, activity, 1);
    expect({ status: save.status, code: save.body.code }).toEqual({ status: 409, code: "EXAM_TIME_OVER" });
    const submit = await submitAttempt(student, activity.id);
    expect({ status: submit.status, code: submit.body.code }).toEqual({ status: 409, code: "EXAM_TIME_OVER" });

    const view = await detail(student, activity.id);
    expect(view.exam).toMatchObject({ endsAt: at(MINUTE).toISOString(), endReason: "TIME_EXPIRED" });
    expect(view.submission).toMatchObject({ submittedAt: at(MINUTE).toISOString(), late: false });
    expect(view.canAnswer).toBe(false);
    const rejected = (await events("activity_submission.rejected")).map((event) => event.metadata);
    expect(rejected).toEqual([
      { operation: "SAVE", code: "EXAM_TIME_OVER" },
      { operation: "SUBMIT", code: "EXAM_TIME_OVER" },
    ]);
  });

  it("018/US3-6 018/FR-014 018/SC-008 com 1 de 3 questões salva, o tempo acaba: a respondida é corrigida e as 2 em branco valem zero sem ação do professor", async () => {
    const activity = await applied({ durationMinutes: 1 });
    const student = await studentClient(students[0]!);
    expect((await startExam(student, activity.id)).status).toBe(200);
    expect((await answerMultipleChoice(student, activity)).status).toBe(200);

    clock.advance(5 * MINUTE);
    // The teacher's roster is a touch too: the attempt is settled before it is read.
    const roster = (await client.get(`/api/classes/${classId}/activities/${activity.id}`)).body as TeacherActivity;
    expect(roster.roster.find((entry) => entry.studentUserId === students[0]!.id)?.status).toBe("TIME_EXPIRED");

    const attempt = await attemptOf(activity.id, students[0]!.id);
    expect(attempt.status).toBe("SUBMITTED");
    expect(attempt.submission).toMatchObject({ endReason: "TIME_EXPIRED", late: false, blankCount: 2, gradePartial: false });
    expect(attempt.submission!.submittedAt.toISOString()).toBe(at(MINUTE).toISOString());
    expect(attempt.submission!.grade.toFixed(2)).toBe("3.33");
    const { questionId } = multipleChoice(activity);
    const byQuestion = Object.fromEntries(attempt.submission!.gradings.map((grading) => [grading.questionId, grading]));
    expect(byQuestion[questionId]).toMatchObject({ status: "GRADED", nature: "RULE_RESULT" });
    expect(byQuestion[questionId]!.finalGrade!.toFixed(2)).toBe("3.33");
    for (const blank of activity.questions.filter((question) => question.id !== questionId)) {
      expect(byQuestion[blank.id]).toMatchObject({ status: "GRADED", nature: "RULE_RESULT", pendingReason: null });
      expect(byQuestion[blank.id]!.finalGrade!.toFixed(2)).toBe("0.00");
    }
  });

  it("018/US3-7 018/FR-011 o aluno atrasado marcado depois inicia 12 minutos após a abertura e tem os 60 minutos inteiros, contados do seu início", async () => {
    const activity = await applied({ durationMinutes: 60, startWindowMinutes: 15, attendance: "NONE" });
    clock.advance(12 * MINUTE);
    expect((await markPresent(client, classId, activity.id, [students[0]!.id])).status).toBe(200);
    const student = await studentClient(students[0]!);
    const started = await startExam(student, activity.id);
    expect(started.status).toBe(200);
    expect((started.body as StudentActivity).exam!.endsAt).toBe(at(72 * MINUTE).toISOString());

    clock.set(at(71 * MINUTE).toISOString());
    expect((await answerMultipleChoice(student, activity)).status).toBe(200);
    clock.set(at(72 * MINUTE + 2 * SECOND).toISOString());
    expect((await answerMultipleChoice(student, activity, 1)).body.code).toBe("EXAM_TIME_OVER");
  });

  it("018/US3-8 018/FR-011 passado o limite para iniciar, o presente que não iniciou vê o aviso, o início é recusado com 409 e ele aparece como \"Não iniciou\"", async () => {
    const activity = await applied({ durationMinutes: 60, startWindowMinutes: 15 });
    const student = await studentClient(students[0]!);

    clock.set(at(15 * MINUTE).toISOString());
    expect((await detail(student, activity.id)).canAnswer).toBe(true);

    clock.set(at(15 * MINUTE + SECOND).toISOString());
    const view = await detail(student, activity.id);
    expect(view.canAnswer).toBe(false);
    expect(view.exam).toMatchObject({ startDeadline: at(15 * MINUTE).toISOString(), endsAt: null });
    const refused = await startExam(student, activity.id);
    expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 409, code: "EXAM_START_CLOSED" });
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(0);
    expect((await events("activity_submission.rejected")).map((event) => event.metadata)).toEqual([{ operation: "START", code: "EXAM_START_CLOSED" }]);

    const roster = (await client.get(`/api/classes/${classId}/activities/${activity.id}`)).body as TeacherActivity;
    expect(roster.roster.find((entry) => entry.studentUserId === students[0]!.id)?.status).toBe("START_CLOSED");
  });

  describe("018/US3-9 duas entregas ou a entrega concorrendo com o fim do tempo geram uma única tentativa encerrada", () => {
    it("018/US3-9 dois cliques em \"Entregar\" ao mesmo tempo: uma submissão, um evento", async () => {
      const activity = await applied({ durationMinutes: 30 });
      const student = await studentClient(students[0]!);
      expect((await startExam(student, activity.id)).status).toBe(200);
      clock.advance(10 * MINUTE);
      const results = await Promise.all([submitAttempt(student, activity.id), submitAttempt(student, activity.id)]);
      expect(results.map((res) => res.status)).toEqual([200, 200]);
      const submissions = await t.prisma.activitySubmission.findMany({ where: { activityId: activity.id } });
      expect(submissions).toHaveLength(1);
      expect(submissions[0]).toMatchObject({ endReason: "STUDENT_SUBMITTED", late: false });
      expect(await events("activity_submission.created")).toHaveLength(1);
      expect((await events("activity_submission.created"))[0]!.metadata).toMatchObject({ endReason: "STUDENT_SUBMITTED", late: false });
    });

    it("018/US3-9 018/FR-013 a entrega que chega dentro da tolerância de 2 s ganha da leitura que acertaria o tempo", async () => {
      const activity = await applied({ durationMinutes: 30 });
      const student = await studentClient(students[0]!);
      expect((await startExam(student, activity.id)).status).toBe(200);
      expect((await answerMultipleChoice(student, activity)).status).toBe(200);
      clock.set(at(30 * MINUTE + 1500).toISOString());
      const [submitted] = await Promise.all([submitAttempt(student, activity.id), client.get(`/api/classes/${classId}/activities/${activity.id}`)]);
      expect(submitted.status).toBe(200);
      const submissions = await t.prisma.activitySubmission.findMany({ where: { activityId: activity.id } });
      expect(submissions.map((row) => row.endReason)).toEqual(["STUDENT_SUBMITTED"]);
      expect(await events("exam_attempt.time_expired")).toHaveLength(0);
    });

    it("018/US3-9 a entrega depois da tolerância concorrendo com leituras: uma submissão por tempo, um evento", async () => {
      const activity = await applied({ durationMinutes: 30 });
      const student = await studentClient(students[0]!);
      expect((await startExam(student, activity.id)).status).toBe(200);
      clock.set(at(30 * MINUTE + 3 * SECOND).toISOString());
      const results = await Promise.all([
        submitAttempt(student, activity.id),
        student.get(`/api/me/activities/${activity.id}`),
        client.get(`/api/classes/${classId}/activities/${activity.id}`),
        student.get("/api/me/activities"),
      ]);
      expect(results[0]!.body.code).toBe("EXAM_TIME_OVER");
      expect(results.slice(1).map((res) => res.status)).toEqual([200, 200, 200]);
      const submissions = await t.prisma.activitySubmission.findMany({ where: { activityId: activity.id } });
      expect(submissions.map((row) => row.endReason)).toEqual(["TIME_EXPIRED"]);
      expect(await events("exam_attempt.time_expired")).toHaveLength(1);
    });
  });

  it("018/FR-013 a resposta que chega dentro da tolerância de 2 s depois do fim é aceita; a partir de 2 s, recusada", async () => {
    const activity = await applied({ durationMinutes: 1 });
    const student = await studentClient(students[0]!);
    expect((await startExam(student, activity.id)).status).toBe(200);

    clock.set(at(MINUTE + 1999).toISOString());
    const late = await answerMultipleChoice(student, activity);
    expect(late.status, JSON.stringify(late.body)).toBe(200);
    expect(late.body.results[0].outcome).toBe("SAVED");

    clock.set(at(MINUTE + 2 * SECOND).toISOString());
    expect((await answerMultipleChoice(student, activity, 1)).body.code).toBe("EXAM_TIME_OVER");
    const attempt = await attemptOf(activity.id, students[0]!.id);
    expect(attempt.submission!.blankCount).toBe(2);
  });

  it("018/FR-012 o aluno vê só o próprio fim: outro aluno que iniciou depois tem o seu", async () => {
    const activity = await applied({ durationMinutes: 20 });
    const first = await studentClient(students[0]!);
    const second = await studentClient(students[1]!);
    expect((await startExam(first, activity.id)).status).toBe(200);
    clock.advance(4 * MINUTE);
    expect((await startExam(second, activity.id)).status).toBe(200);
    expect((await detail(first, activity.id)).exam!.endsAt).toBe(at(20 * MINUTE).toISOString());
    expect((await detail(second, activity.id)).exam!.endsAt).toBe(at(24 * MINUTE).toISOString());
    // The 012 start body (`{}`) doesn't start an exam: the rules must be accepted.
    expect((await startAttempt(await studentClient(students[2]!), activity.id)).status).toBe(400);
  });
});
