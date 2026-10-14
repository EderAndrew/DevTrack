import type { AttemptPauses, ExamMonitor, StudentActivity, TeacherActivity, TeacherExam, TeacherPause } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, saveAnswers, submitAttempt } from "../helpers/activities";
import { declareExit, getAttemptPauses, getMyPause, getRoom, pauseStudent, releasePause } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, getExamMonitor, holdByHand, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 018/US6 — the teacher pauses a student who needs to leave the room (018/FR-026, FR-027, research
 * T11): the 016 pause, started only by the teacher ("Sair da sala" → 409 EXIT_NOT_ALLOWED), hides the
 * questions and answers on every device and refuses every write while the exam's time keeps running.
 * "Liberar retorno" resumes with the time that is left; once the time is over the release is refused
 * and the pause ends with the attempt, by derivation (`TIME_EXPIRED`).
 *
 * The clock starts at the real time, as in the US5 suite (the hold's trigger reads the database clock).
 */

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();
const SECOND = 1000;
type Client = ReturnType<typeof api>;

describe("018/US6 o professor pausa o aluno que precisa sair da sala", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let exam: TeacherExam;

  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const auditOf = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
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
  const pause = async (activityId: string, studentUserId: string) => {
    const res = await pauseStudent(client, classId, activityId, studentUserId);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherPause;
  };
  const multipleChoice = (activity: TeacherActivity) => {
    const question = activity.questions.find((item) => item.type === "MULTIPLE_CHOICE")!;
    return { questionId: question.id, answer: { kind: "ALTERNATIVE" as const, alternativeId: question.alternatives.find((alt) => alt.isCorrect)!.id } };
  };
  /** A 30-minute exam that student 0 started at START and answered one question of. */
  const started = async () => {
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, durationMinutes: 30 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const activity = res.body as TeacherActivity;
    const student = await studentClient(students[0]!);
    expect((await startExam(student, activity.id)).status).toBe(200);
    expect((await saveAnswers(student, activity.id, [{ ...multipleChoice(activity), baseRevision: 0 }])).status).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: students[0]!.id } });
    return { activity, student, attempt, endsAt: new Date(new Date(START).getTime() + 30 * MINUTE) };
  };

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
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    classId = created.schoolClass.id;
    students = created.students;
    exam = await approvedExam(t, client, syllabus);
  });

  it("018/US6-1 018/FR-026 pausado pelo professor: sem enunciados nem respostas em qualquer dispositivo, o tempo do servidor segue", async () => {
    const { activity, student, endsAt } = await started();
    clock.advance(10 * MINUTE);
    const opened = await pause(activity.id, students[0]!.id);
    expect(opened).toMatchObject({ initiatedBy: "TEACHER", reason: "TEACHER", endedAt: null, endedBy: null });

    // Two sessions of the same student: neither gets a statement or an answer.
    const other = await studentClient(students[0]!);
    for (const session of [student, other]) {
      const view = await detail(session, activity.id);
      expect(view.pause).toMatchObject({ id: opened.id, initiatedBy: "TEACHER" });
      expect(view.questions).toEqual([]);
      expect(view.attempt?.answers).toEqual([]);
      expect(view.exam?.endsAt).toBe(endsAt.toISOString());
      expect((await getMyPause(session, activity.id)).body).toMatchObject({ pause: { id: opened.id } });
    }
    // Every write is refused (016 ATTEMPT_PAUSED).
    const save = await saveAnswers(student, activity.id, [{ ...multipleChoice(activity), baseRevision: 1 }]);
    expect([save.status, save.body.code]).toEqual([409, "ATTEMPT_PAUSED"]);
    const submit = await submitAttempt(student, activity.id);
    expect([submit.status, submit.body.code]).toEqual([409, "ATTEMPT_PAUSED"]);

    const row = (await monitor(activity.id)).students.find((item) => item.studentUserId === students[0]!.id)!;
    expect(row).toMatchObject({ examStatus: "PAUSED", endsAt: endsAt.toISOString(), openPause: { id: opened.id } });
  });

  it("018/US6-2 018/FR-027 eventos de foco, de copiar/colar e de inatividade na pausa: recusados, nada gravado, nada conta", async () => {
    const { activity, student, attempt } = await started();
    await pause(activity.id, students[0]!.id);
    for (const type of ["SCREEN_LEFT", "FULLSCREEN_EXITED", "PASTE_BLOCKED", "INACTIVITY"] as const) {
      const res = await recordEvents(student, activity.id, [integrityEvent(type, type === "INACTIVITY" ? { idleSeconds: 45 } : {})]);
      expect([res.status, res.body.code], type).toEqual([409, "ATTEMPT_PAUSED"]);
      clock.advance(5 * SECOND);
    }
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId: attempt.id } })).toBe(0);
    expect(await t.prisma.examOccurrence.count({ where: { attemptId: attempt.id } })).toBe(0);
    expect((await detail(student, activity.id)).exam?.occurrences.count).toBe(0);
  });

  it("018/US6-3 018/FR-027 o tempo acaba na pausa: a tentativa é encerrada por tempo com as respostas salvas e a pausa termina com ela", async () => {
    const { activity, student, attempt, endsAt } = await started();
    clock.advance(25 * MINUTE);
    const opened = await pause(activity.id, students[0]!.id);
    clock.set(new Date(endsAt.getTime() + MINUTE));

    // The pause already ended at the attempt's end, before any settlement.
    const room = await getRoom(client, classId, activity.id);
    expect(room.status).toBe(200);
    expect(room.body.students.find((item: { studentUserId: string }) => item.studentUserId === students[0]!.id).openPause).toBeNull();
    // Releasing it after the end is refused: the attempt is over by time.
    const late = await releasePause(client, classId, activity.id, opened.id);
    expect([late.status, late.body.code]).toEqual([409, "EXAM_TIME_OVER"]);
    expect((await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: opened.id } })).releasedAt).toBeNull();

    // The student's next touch settles the attempt; the saved answer is the one graded.
    const view = await detail(student, activity.id);
    expect(view.pause).toBeNull();
    expect(view.exam?.endReason).toBe("TIME_EXPIRED");
    const submission = await t.prisma.activitySubmission.findUniqueOrThrow({ where: { attemptId: attempt.id } });
    expect(submission).toMatchObject({ endReason: "TIME_EXPIRED", submittedAt: endsAt });
    expect(submission.blankCount).toBe(activity.questions.length - 1);
    expect(await auditOf("exam_attempt.time_expired")).toHaveLength(1);

    const pauses = await getAttemptPauses(client, classId, activity.id, attempt.id);
    expect(pauses.status).toBe(200);
    expect((pauses.body as AttemptPauses).items).toEqual([
      expect.objectContaining({ id: opened.id, endedAt: endsAt.toISOString(), endedBy: "TIME_EXPIRED", seconds: 5 * 60 }),
    ]);
    expect((pauses.body as AttemptPauses).totalSecondsAway).toBe(5 * 60);
    const row = (await monitor(activity.id)).students.find((item) => item.studentUserId === students[0]!.id)!;
    expect(row).toMatchObject({ examStatus: "TIME_EXPIRED", openPause: null });
    // Still refused once settled.
    const again = await releasePause(client, classId, activity.id, opened.id);
    expect([again.status, again.body.code]).toEqual([409, "EXAM_TIME_OVER"]);
  });

  it("018/US6-4 018/FR-027 liberar o retorno com tempo restante: 20 min, 2 min de pausa → 18 min, respostas intactas, nenhuma ocorrência na pausa", async () => {
    const { activity, student, attempt, endsAt } = await started();
    clock.advance(10 * MINUTE);
    const opened = await pause(activity.id, students[0]!.id);
    clock.advance(2 * MINUTE);
    await recordEvents(student, activity.id, [integrityEvent("SCREEN_LEFT")]);

    const released = await releasePause(client, classId, activity.id, opened.id);
    expect(released.status, JSON.stringify(released.body)).toBe(200);
    expect(released.body).toMatchObject({ endedBy: "RELEASE", endedAt: clock.now().toISOString(), seconds: 120 });

    // The pause never moves the end: 18 minutes left, the answer back on every device.
    const view = await detail(student, activity.id);
    expect(view.pause).toBeNull();
    expect(view.exam?.endsAt).toBe(endsAt.toISOString());
    expect(new Date(view.exam!.endsAt!).getTime() - new Date(view.serverNow).getTime()).toBe(18 * MINUTE);
    expect(view.questions).toHaveLength(activity.questions.length);
    expect(view.attempt?.answers).toEqual([expect.objectContaining({ questionId: multipleChoice(activity).questionId, revision: 1 })]);
    expect(await t.prisma.examOccurrence.count({ where: { attemptId: attempt.id } })).toBe(0);

    // Back to the rules of US4: the next occurrence counts as the 1st.
    const after = await recordEvents(student, activity.id, [integrityEvent("SCREEN_LEFT")]);
    expect(after.status).toBe(200);
    expect(after.body.exam).toEqual({ occurrenceCount: 1, held: false });
    expect((await monitor(activity.id)).students.find((item) => item.studentUserId === students[0]!.id)).toMatchObject({
      examStatus: "ANSWERING",
      openPause: null,
    });
  });

  it("018/US6-5 018/FR-026 \"Sair da sala\" não existe na prova: 409 EXIT_NOT_ALLOWED, nada gravado, recusa auditada", async () => {
    const { activity, student, attempt } = await started();
    const res = await declareExit(student, activity.id, { reason: "BATHROOM" });
    expect([res.status, res.body.code]).toEqual([409, "EXIT_NOT_ALLOWED"]);
    expect(await t.prisma.attemptPause.count({ where: { attemptId: attempt.id } })).toBe(0);
    expect((await auditOf("activity_submission.rejected")).map((event) => [event.actorUserId, event.targetId, event.metadata])).toEqual([
      [students[0]!.id, activity.id, { operation: "EXIT", code: "EXIT_NOT_ALLOWED" }],
    ]);
    expect(await auditOf("attempt_pause.started")).toHaveLength(0);
    // Before the start too: the option does not exist in an exam.
    const notStarted = await declareExit(await studentClient(students[1]!), activity.id);
    expect([notStarted.status, notStarted.body.code]).toEqual([409, "EXIT_NOT_ALLOWED"]);
  });

  it("018/FR-026 pausar um aluno com a prova retida é recusado com 409 EXAM_ATTEMPT_ON_HOLD", async () => {
    const { activity, attempt } = await started();
    await holdByHand(t, attempt, clock.now());
    const res = await pauseStudent(client, classId, activity.id, students[0]!.id);
    expect([res.status, res.body.code]).toEqual([409, "EXAM_ATTEMPT_ON_HOLD"]);
    expect(await t.prisma.attemptPause.count({ where: { attemptId: attempt.id } })).toBe(0);
  });

  it("018/FR-027 pausar depois do fim do tempo é recusado com 409 EXAM_TIME_OVER, nada gravado", async () => {
    const { activity, attempt, endsAt } = await started();
    clock.set(endsAt);
    const res = await pauseStudent(client, classId, activity.id, students[0]!.id);
    expect([res.status, res.body.code]).toEqual([409, "EXAM_TIME_OVER"]);
    expect(await t.prisma.attemptPause.count({ where: { attemptId: attempt.id } })).toBe(0);
    expect(await auditOf("attempt_pause.started")).toHaveLength(0);
  });
});
