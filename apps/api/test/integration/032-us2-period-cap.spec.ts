import type { AttemptPauses, ExamMonitor, StudentActivity, TeacherActivity, TeacherExam, TeacherExamHold } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, saveAnswers, submitAttempt } from "../helpers/activities";
import { getAttemptPauses, getRoom, pauseStudent } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, decideHold, getExamMonitor, holdByHand, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 032/US2 — an exam attempt ends at the earliest of its start + the duration, the period's end and
 * the teacher's close or cancellation (032/FR-009, research AP3): the clock of a late student shows
 * only what is left of the period, saves and the hand-in keep the 2 s grace of 018, the attempt that
 * runs out is settled as a time-out by the next touch, and the decisions on a hold follow that end.
 *
 * The suite's clock starts at the real time (to the minute): the hold's trigger checks a return
 * against the database clock, the backstop of the service's check with the injected clock.
 */

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();
const SECOND = 1000;
const at = (ms: number) => new Date(new Date(START).getTime() + ms);
const iso = (ms: number) => at(ms).toISOString();
/** The period's end of most scenarios: 90 min after the opening, for a 60 min exam ("até 22:00"). */
const END = 90 * MINUTE;
type Client = ReturnType<typeof api>;

describe("032/US2 o tempo do aluno na prova termina no fim do período", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let exam: TeacherExam;

  const base = () => `/api/classes/${classId}/activities`;
  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const auditOf = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  /** An exam applied now through the route, every student present: 60 min, the period until END. */
  const applied = async (overrides: Parameters<typeof applyExam>[3] = {}) => {
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, deadline: iso(END), ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  const detail = async (student: Client, activityId: string) => {
    const res = await student.get(`/api/me/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentActivity;
  };
  const monitor = async (activityId: string) => {
    const res = await getExamMonitor(client, classId, activityId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as ExamMonitor;
  };
  const multipleChoice = (activity: TeacherActivity, baseRevision = 0) => {
    const question = activity.questions.find((item) => item.type === "MULTIPLE_CHOICE")!;
    const alternativeId = question.alternatives.find((alternative) => alternative.isCorrect)!.id;
    return [{ questionId: question.id, answer: { kind: "ALTERNATIVE" as const, alternativeId }, baseRevision }];
  };
  /** Student `index` starts the exam at `when` (ms after START). */
  const startedAt = async (activity: TeacherActivity, index: number, when: number) => {
    clock.set(iso(when));
    const student = await studentClient(students[index]!);
    const res = await startExam(student, activity.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: students[index]!.id } });
    return { student, attempt, view: res.body as StudentActivity };
  };
  const submissionOf = (attemptId: string) => t.prisma.activitySubmission.findUniqueOrThrow({ where: { attemptId } });

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

  it("032/US2-1 032/FR-009 quem começa 30 min antes do fim de uma prova de 60 min tem 30 min: o fim é o do período, para o aluno e no monitor", async () => {
    const activity = await applied();
    const { student, view } = await startedAt(activity, 0, END - 30 * MINUTE);
    expect(view.exam!.endsAt).toBe(iso(END));

    // Reloading later shows the same end, never start + 60 min.
    clock.set(iso(END - 10 * MINUTE));
    expect((await detail(student, activity.id)).exam!.endsAt).toBe(iso(END));
    const row = (await monitor(activity.id)).students.find((item) => item.studentUserId === students[0]!.id)!;
    expect(row.endsAt).toBe(iso(END));
  });

  it("032/SC-003 o fim mostrado é sempre o menor entre o início + a duração e o fim do período", async () => {
    // A period of 70 min for a 60 min exam: both sides of the cut and the boundary between them.
    const activity = await applied({ deadline: iso(70 * MINUTE) });
    const cases = [
      [0, 0], // start + 60 < the period's end: the duration
      [1, 10 * MINUTE], // start + 60 = the period's end
      [2, 40 * MINUTE], // late: the period's end
    ] as const;
    for (const [index, start] of cases) {
      const { view } = await startedAt(activity, index, start);
      const expected = Math.min(at(start).getTime() + 60 * MINUTE, at(70 * MINUTE).getTime());
      expect(view.exam!.endsAt, `start ${start / MINUTE} min`).toBe(new Date(expected).toISOString());
    }
  });

  it("032/US2-2 032/SC-002 salvar e entregar valem até o fim do período + 2 s; depois 409 EXAM_TIME_OVER e o próximo acesso encerra por tempo", async () => {
    const activity = await applied();
    const late = await startedAt(activity, 0, END - 30 * MINUTE);
    const onTime = await startedAt(activity, 1, END - 30 * MINUTE);

    // Within the grace: a save and a hand-in already on the way still land.
    clock.set(iso(END + SECOND));
    expect((await saveAnswers(late.student, activity.id, multipleChoice(activity))).status).toBe(200);
    const handed = await submitAttempt(onTime.student, activity.id, multipleChoice(activity));
    expect(handed.status, JSON.stringify(handed.body)).toBe(200);
    expect(await submissionOf(onTime.attempt.id)).toMatchObject({ endReason: "STUDENT_SUBMITTED", late: false });

    clock.set(iso(END + 2 * SECOND));
    const save = await saveAnswers(late.student, activity.id, multipleChoice(activity, 1));
    expect([save.status, save.body.code]).toEqual([409, "EXAM_TIME_OVER"]);
    const submit = await submitAttempt(late.student, activity.id);
    expect([submit.status, submit.body.code]).toEqual([409, "EXAM_TIME_OVER"]);

    // Exactly as an attempt whose duration ran out: settled by the next touch, never cancelled.
    const view = await detail(late.student, activity.id);
    expect(view.exam).toMatchObject({ endsAt: iso(END), endReason: "TIME_EXPIRED" });
    expect(view.canAnswer).toBe(false);
    const submission = await submissionOf(late.attempt.id);
    expect(submission).toMatchObject({ endReason: "TIME_EXPIRED", late: false, submittedAt: at(END) });
    expect(submission.blankCount).toBe(activity.questions.length - 1);
    expect((await auditOf("exam_attempt.time_expired")).map((event) => [event.actorType, event.targetId])).toEqual([["SYSTEM", late.attempt.id]]);
    expect((await monitor(activity.id)).students.find((item) => item.studentUserId === students[0]!.id)).toMatchObject({ examStatus: "TIME_EXPIRED" });
  });

  it("032/US2-2 032/SC-002 a pausa aberta no fim do período termina com ele, por tempo", async () => {
    const activity = await applied();
    const { attempt } = await startedAt(activity, 0, END - 30 * MINUTE);
    clock.set(iso(END - 5 * MINUTE));
    const paused = await pauseStudent(client, classId, activity.id, students[0]!.id);
    expect(paused.status, JSON.stringify(paused.body)).toBe(201);

    clock.set(iso(END + MINUTE));
    const room = await getRoom(client, classId, activity.id);
    expect(room.status).toBe(200);
    expect(room.body.students.find((item: { studentUserId: string }) => item.studentUserId === students[0]!.id).openPause).toBeNull();
    const pauses = await getAttemptPauses(client, classId, activity.id, attempt.id);
    expect(pauses.status, JSON.stringify(pauses.body)).toBe(200);
    expect((pauses.body as AttemptPauses).items).toEqual([expect.objectContaining({ endedAt: iso(END), endedBy: "TIME_EXPIRED", seconds: 5 * 60 })]);
  });

  it("032/US2-3 quem começou cedo termina pela duração; o fim do período não muda nada para ele", async () => {
    const activity = await applied({ deadline: iso(170 * MINUTE) });
    const { student, attempt, view } = await startedAt(activity, 0, 5 * MINUTE);
    expect(view.exam!.endsAt).toBe(iso(65 * MINUTE));

    clock.set(iso(65 * MINUTE + 2 * SECOND));
    const save = await saveAnswers(student, activity.id, multipleChoice(activity));
    expect([save.status, save.body.code]).toEqual([409, "EXAM_TIME_OVER"]);
    expect((await detail(student, activity.id)).exam).toMatchObject({ endsAt: iso(65 * MINUTE), endReason: "TIME_EXPIRED" });
    expect(await submissionOf(attempt.id)).toMatchObject({ endReason: "TIME_EXPIRED", submittedAt: at(65 * MINUTE) });
  });

  it("032/US2-4 em espera de decisão quando o período termina: devolver é recusado, “Não cancelar” e cancelar são aceitos", async () => {
    const activity = await applied();
    const first = await startedAt(activity, 0, END - 30 * MINUTE);
    const second = await startedAt(activity, 1, END - 30 * MINUTE);
    const firstHold = await holdByHand(t, { id: first.attempt.id, activityId: activity.id, studentUserId: students[0]!.id }, at(END - 20 * MINUTE));
    const secondHold = await holdByHand(t, { id: second.attempt.id, activityId: activity.id, studentUserId: students[1]!.id }, at(END - 20 * MINUTE));

    // Before the end there is time left: "Não cancelar" would be a return.
    clock.set(iso(END - MINUTE));
    const early = await decideHold(client, classId, activity.id, firstHold.id, "keep");
    expect([early.status, early.body.code]).toEqual([409, "EXAM_TIME_NOT_OVER"]);

    clock.set(iso(END));
    const row = (await monitor(activity.id)).students.find((item) => item.attemptId === first.attempt.id)!;
    expect(row).toMatchObject({ examStatus: "AWAITING_DECISION", openHold: { id: firstHold.id, canReturn: false } });
    const returned = await decideHold(client, classId, activity.id, firstHold.id, "return");
    expect([returned.status, returned.body.code]).toEqual([409, "EXAM_TIME_OVER"]);
    expect(await auditOf("exam_attempt.returned")).toEqual([]);

    const kept = await decideHold(client, classId, activity.id, firstHold.id, "keep");
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
    expect(kept.body as TeacherExamHold).toMatchObject({ resolution: "NOT_CANCELLED", canReturn: false });
    expect(await submissionOf(first.attempt.id)).toMatchObject({ endReason: "ENDED_BY_WARNINGS" });

    clock.set(iso(END + 10 * MINUTE));
    const cancelled = await decideHold(client, classId, activity.id, secondHold.id, "cancel");
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(await submissionOf(second.attempt.id)).toMatchObject({ endReason: "CANCELLED" });
  });

  it("032/US2-4 o professor estende o término antes do fim: a espera passa a poder ser devolvida, com o novo fim", async () => {
    const activity = await applied();
    const { student, attempt } = await startedAt(activity, 0, END - 30 * MINUTE);
    const hold = await holdByHand(t, { id: attempt.id, activityId: activity.id, studentUserId: students[0]!.id }, at(END - 20 * MINUTE));

    clock.set(iso(END - 10 * MINUTE));
    const current = (await client.get(`${base()}/${activity.id}`)).body as TeacherActivity;
    const extended = await client.patch(`${base()}/${activity.id}`, { version: current.version, deadline: iso(END + 30 * MINUTE) });
    expect(extended.status, JSON.stringify(extended.body)).toBe(200);

    // Past the original end, inside the new one: time is left, so the return is accepted.
    clock.set(iso(END + 5 * MINUTE));
    expect((await monitor(activity.id)).students.find((item) => item.attemptId === attempt.id)).toMatchObject({ openHold: { canReturn: true } });
    const returned = await decideHold(client, classId, activity.id, hold.id, "return");
    expect(returned.status, JSON.stringify(returned.body)).toBe(200);
    // start (END − 30) + 60 = END + 30 = the new period's end.
    expect((await detail(student, activity.id)).exam).toMatchObject({ hold: null, endReason: null, endsAt: iso(END + 30 * MINUTE) });
  });

  it("032/US2-4 o trigger exam_attempt_holds_transition recusa devolver depois do fim do período e aceita depois da extensão", async () => {
    // The database checks the return with its own clock (the real time): this exam's period ends
    // 10 min ago, while start + 60 min is still ahead.
    clock.set(iso(-80 * MINUTE));
    const activity = await applied({ deadline: iso(-10 * MINUTE) });
    const { attempt } = await startedAt(activity, 0, -45 * MINUTE);
    const hold = await holdByHand(t, { id: attempt.id, activityId: activity.id, studentUserId: students[0]!.id }, at(-40 * MINUTE));
    const returnByHand = () =>
      t.prisma.examAttemptHold.update({ where: { id: hold.id }, data: { resolution: "RETURNED", resolvedAt: new Date(), resolvedById: teacher.id } });

    await expect(returnByHand()).rejects.toThrow(/no time left/);

    // Extended through the route before the end (by the injected clock), to 30 min ahead.
    clock.set(iso(-20 * MINUTE));
    const current = (await client.get(`${base()}/${activity.id}`)).body as TeacherActivity;
    const extended = await client.patch(`${base()}/${activity.id}`, { version: current.version, deadline: iso(30 * MINUTE) });
    expect(extended.status, JSON.stringify(extended.body)).toBe(200);
    await expect(returnByHand()).resolves.toMatchObject({ resolution: "RETURNED" });
  });

  it("032/US2-5 encerrar a prova antes do fim do período corta o tempo de todos nesse momento, motivo ACTIVITY_CLOSED", async () => {
    const activity = await applied();
    const first = await startedAt(activity, 0, 0);
    const second = await startedAt(activity, 1, 10 * MINUTE);

    clock.set(iso(30 * MINUTE));
    expect((await client.post(`${base()}/${activity.id}/close`, {})).status).toBe(200);
    clock.set(iso(31 * MINUTE));
    expect((await detail(first.student, activity.id)).exam).toMatchObject({ endsAt: iso(30 * MINUTE), endReason: "ACTIVITY_CLOSED" });
    await monitor(activity.id);
    for (const { attempt } of [first, second]) {
      expect(await submissionOf(attempt.id)).toMatchObject({ endReason: "ACTIVITY_CLOSED", submittedAt: at(30 * MINUTE) });
    }
  });

  it("032/US2-5 cancelar a prova antes do fim do período corta o tempo de todos nesse momento", async () => {
    const activity = await applied();
    const { attempt } = await startedAt(activity, 0, 0);

    clock.set(iso(20 * MINUTE));
    expect((await client.post(`${base()}/${activity.id}/cancel`, {})).status).toBe(200);
    clock.set(iso(21 * MINUTE));
    await monitor(activity.id);
    expect(await submissionOf(attempt.id)).toMatchObject({ endReason: "ACTIVITY_CLOSED", submittedAt: at(20 * MINUTE) });
  });
});
