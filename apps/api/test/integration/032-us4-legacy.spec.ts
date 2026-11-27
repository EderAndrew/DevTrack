import type { Answer, ClassRanking, StudentActivity, StudentHistoryPage, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import {
  applyExercises,
  cancelByHand,
  closeByHand,
  completeAttempt,
  createActivity,
  createAttemptRow,
  createClassWithStudents,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "../helpers/activities";
import { getRoom, markPresent } from "../helpers/attendance";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 032/US4 — the activities applied before 032 keep working (032/FR-015, FR-016, research AP2, AP7). Their rows are
 * written as the migration left them (`createActivity`: a work's `deadline` is the period's end, a legacy work may keep
 * `ACCEPT_MARKED`, an exam's end is publication + window + duration): a `REJECT` work behaves as any 032 work, a legacy
 * `ACCEPT_MARKED` work keeps taking late submissions and attendance marks after its end, and what the teacher and the
 * student read of a closed, cancelled or archived activity stays the same (032/SC-005). 032/US4-1 (the migration of
 * the rows) is in `032-schema.spec.ts`.
 *
 * The clock starts at the real time, as 029's suites: the exam triggers compare with the database clock.
 */

type Client = ReturnType<typeof api>;

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();
const SECOND = 1000;

const choice = (alternativeId: string): Answer => ({ kind: "ALTERNATIVE", alternativeId });

describe("032/US4 atividades já aplicadas continuam funcionando", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let schoolClass: SchoolClass;
  let students: TestUser[];
  let syllabus: ConfirmedSyllabus;
  let work: WorkFixture;

  const at = (offset: number) => new Date(new Date(START).getTime() + offset);
  const clientOf = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });
  /** A work applied before 032: published 3 h ago, its period ending in 1 h, as the migration left it. */
  const legacyWork = (extra: Parameters<typeof createActivity>[2] = {}) =>
    createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      title: "Trabalho anterior",
      publishAt: at(-3 * HOUR),
      deadline: at(HOUR),
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
      ...extra,
    });
  const detail = async (activityId: string): Promise<TeacherActivity> => {
    const res = await teacherClient.get(`/api/classes/${schoolClass.id}/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as TeacherActivity;
  };
  const rosterOf = async (activityId: string) =>
    Object.fromEntries((await detail(activityId)).roster.map((entry) => [entry.studentUserId, entry.status]));
  const history = async (as: Client): Promise<StudentHistoryPage> => {
    const res = await as.get("/api/me/history");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentHistoryPage;
  };
  const ranking = async (as: Client): Promise<ClassRanking> => {
    const res = await as.get(`/api/me/classes/${schoolClass.id}/ranking`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as ClassRanking;
  };
  /** Starts and submits the only question of the work with its first alternative. */
  const startAndSubmit = async (as: Client, activityId: string) => {
    const started = await startAttempt(as, activityId);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const question = (started.body as StudentActivity).questions[0]!;
    return submitAttempt(as, activityId, [{ questionId: question.id, answer: choice(question.alternatives[0]!.id), baseRevision: 0 }]);
  };
  const codeOf = (res: { status: number; body: { code?: string } }) => [res.status, res.body.code];

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Ana Professora" });
    teacherClient = await clientOf(teacher);
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus });
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 3 });
    schoolClass = created.schoolClass;
    students = created.students;
  });

  it("032/US4-2 trabalho REJECT: o período vai do início ao prazo, com o mesmo comportamento", async () => {
    const { activity } = await legacyWork();
    const view = await detail(activity.id);
    expect({ publishAt: view.publishAt, deadline: view.deadline, latePolicy: view.latePolicy }).toEqual({
      publishAt: at(-3 * HOUR).toISOString(),
      deadline: at(HOUR).toISOString(),
      latePolicy: "REJECT",
    });

    // Inside the period: start, save and submit as before.
    const onTime = await clientOf(students[0]!);
    const submitted = await startAndSubmit(onTime, activity.id);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    const started = await clientOf(students[1]!);
    expect((await startAttempt(started, activity.id)).status).toBe(200);

    // After the end nobody starts, saves or submits (the 012 REJECT), never an automatic submission.
    clock.set(at(HOUR + SECOND).toISOString());
    const latecomer = await clientOf(students[2]!);
    expect(codeOf(await startAttempt(latecomer, activity.id))).toEqual([409, "DEADLINE_PASSED"]);
    const question = (await started.get(`/api/me/activities/${activity.id}`)).body as StudentActivity;
    const answers = [{ questionId: question.questions[0]!.id, answer: choice(question.questions[0]!.alternatives[0]!.id), baseRevision: 0 }];
    expect(codeOf(await saveAnswers(started, activity.id, answers))).toEqual([409, "DEADLINE_PASSED"]);
    expect(codeOf(await submitAttempt(started, activity.id, answers))).toEqual([409, "DEADLINE_PASSED"]);
    expect(await t.prisma.activitySubmission.count({ where: { activityId: activity.id } })).toBe(1);
    expect(await rosterOf(activity.id)).toEqual({
      [students[0]!.id]: "SUBMITTED",
      // Started but not submitted: MISSED once the end passed (the 012 derivation, unchanged).
      [students[1]!.id]: "MISSED",
      [students[2]!.id]: "MISSED",
    });

    // A REJECT work that takes attendance refuses a mark after its end (032/FR-014), as any 032 work.
    const attended = await legacyWork({ releaseMode: "PRESENT_ONLY" });
    expect(codeOf(await markPresent(teacherClient, schoolClass.id, attended.activity.id, [students[0]!.id]))).toEqual([409, "ACTIVITY_PERIOD_ENDED"]);
    expect((await getRoom(teacherClient, schoolClass.id, attended.activity.id)).body).toMatchObject({ periodEnded: true });
  });

  it("032/US4-3 032/SC-005 trabalho legado ACCEPT_MARKED: depois do fim aceita entrega marcada atrasada e presença; nenhuma entrega perde a marca", async () => {
    const { activity } = await legacyWork({ latePolicy: "ACCEPT_MARKED", releaseMode: "PRESENT_ONLY" });
    expect((await markPresent(teacherClient, schoolClass.id, activity.id, [students[0]!.id, students[2]!.id])).status).toBe(200);
    // A late submission made before 032 (the end had passed under the old deadline).
    const before = await createAttemptRow(t, activity.id, students[2]!.id, {
      startedAt: at(-2 * HOUR),
      submission: { submittedAt: at(-HOUR), late: true },
    });

    const onTime = await clientOf(students[0]!);
    expect((await startAttempt(onTime, activity.id)).status).toBe(200);

    clock.set(at(2 * HOUR).toISOString());
    expect((await detail(activity.id)).latePolicy).toBe("ACCEPT_MARKED");
    // The attendance still takes a mark after the end, and the student marked starts and submits late.
    const room = await getRoom(teacherClient, schoolClass.id, activity.id);
    expect(room.body).toMatchObject({ periodEnded: false });
    expect((await markPresent(teacherClient, schoolClass.id, activity.id, [students[1]!.id])).status).toBe(200);
    const latecomer = await clientOf(students[1]!);
    const late = await startAndSubmit(latecomer, activity.id);
    expect(late.status, JSON.stringify(late.body)).toBe(200);
    // The one started in the period also submits, marked late.
    const question = (await onTime.get(`/api/me/activities/${activity.id}`)).body as StudentActivity;
    const submitted = await submitAttempt(onTime, activity.id, [
      { questionId: question.questions[0]!.id, answer: choice(question.questions[0]!.alternatives[0]!.id), baseRevision: 0 },
    ]);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);

    const rows = await t.prisma.activitySubmission.findMany({ where: { activityId: activity.id }, select: { studentUserId: true, late: true } });
    expect(Object.fromEntries(rows.map((row) => [row.studentUserId, row.late]))).toEqual({
      [students[0]!.id]: true,
      [students[1]!.id]: true,
      [students[2]!.id]: true,
    });
    expect(await t.prisma.activitySubmission.findUniqueOrThrow({ where: { id: before.submissionId! } })).toMatchObject({ late: true });
    expect(await rosterOf(activity.id)).toEqual({
      [students[0]!.id]: "SUBMITTED_LATE",
      [students[1]!.id]: "SUBMITTED_LATE",
      [students[2]!.id]: "SUBMITTED_LATE",
    });

    // Until the teacher closes it, exactly as before.
    await closeByHand(t, activity.id, at(3 * HOUR));
    clock.set(at(4 * HOUR).toISOString());
    expect((await markPresent(teacherClient, schoolClass.id, activity.id, [students[1]!.id])).status).not.toBe(200);
  });

  it("032/US4-4 032/SC-005 encerrada, cancelada ou de turma arquivada: Histórico, notas, revisão e ranking iguais", async () => {
    const student = students[0]!;
    const client = await clientOf(student);

    // An exercise concluded through the routes: the ranking's points (032/SC-006 keeps exercises as before).
    const exercise = await createExercise(t, teacher.id, { difficulty: "BASIC" });
    const applied = await applyExercises(teacherClient, schoolClass.id, [exercise.id], { acknowledgeOutOfScope: true });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    const started = await startAttempt(client, applied.body.id);
    const exerciseView = started.body as StudentActivity;
    const exerciseAnswer = { questionId: exerciseView.questions[0]!.id, answer: choice(exerciseView.questions[0]!.alternatives[0]!.id), baseRevision: 0 };
    expect((await completeAttempt(client, applied.body.id, 1, [exerciseAnswer])).status).toBe(200);

    // A legacy ACCEPT_MARKED work delivered late, graded, released and closed.
    const graded = await legacyWork({ title: "Trabalho corrigido", latePolicy: "ACCEPT_MARKED", deadline: at(-2 * DAY), publishAt: at(-4 * DAY), resultReleasedAt: at(-HOUR) });
    const delivered = await createAttemptRow(t, graded.activity.id, student.id, {
      startedAt: at(-2 * DAY - HOUR),
      submission: { submittedAt: at(-2 * DAY + HOUR), late: true, gradeCents: 80, generalFeedback: "Bom trabalho." },
    });
    await closeByHand(t, graded.activity.id, at(-30 * MINUTE));
    // A REJECT work cancelled after a delivery.
    const cancelled = await legacyWork({ title: "Trabalho cancelado" });
    await createAttemptRow(t, cancelled.activity.id, student.id, { startedAt: at(-2 * HOUR), submission: { submittedAt: at(-HOUR) } });
    await cancelByHand(t, cancelled.activity.id, at(-20 * MINUTE));
    // An exam of the 018 start window (published 19:00-like, window 15, 60 min → end = publication + 75 min), closed.
    const exam = await createActivity(t, schoolClass, { type: "EXAM", title: "Prova anterior", publishAt: at(-5 * HOUR), startWindowMinutes: 15, durationMinutes: 60 });
    expect(exam.activity.deadline?.toISOString()).toBe(at(-5 * HOUR + 75 * MINUTE).toISOString());
    await t.prisma.activityAttendance.create({
      data: { activityId: exam.activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: at(-5 * HOUR), markedById: teacher.id },
    });
    await createAttemptRow(t, exam.activity.id, student.id, {
      startedAt: at(-5 * HOUR + 5 * MINUTE),
      submission: { submittedAt: at(-4 * HOUR), endReason: "STUDENT_SUBMITTED", gradePartial: true },
    });
    await closeByHand(t, exam.activity.id, at(-10 * MINUTE));

    const historyBefore = await history(client);
    expect(historyBefore.items.map((item) => [item.title, item.situation])).toEqual([
      // Newest delivery first (028): the cancelled work's (−1 h), the exam's (−4 h), the graded work's (−2 days).
      ["Trabalho cancelado", "CANCELLED"],
      ["Prova anterior", "AWAITING"],
      ["Trabalho corrigido", "GRADED"],
    ]);
    expect(historyBefore.items.find((item) => item.id === graded.activity.id)!.result).toMatchObject({ grade: "0.80" });
    const review = await client.get(`/api/me/activities/${graded.activity.id}`);
    expect(review.status, JSON.stringify(review.body)).toBe(200);
    const attemptView = await teacherClient.get(`/api/classes/${schoolClass.id}/activities/${graded.activity.id}/attempts/${delivered.attemptId}`);
    expect(attemptView.status, JSON.stringify(attemptView.body)).toBe(200);
    const rosterBefore = (await detail(graded.activity.id)).roster.find((entry) => entry.studentUserId === student.id);
    expect(rosterBefore).toMatchObject({ status: "SUBMITTED_LATE", grade: "0.80" });
    const rankingBefore = await ranking(client);
    expect(rankingBefore.rows.find((row) => row.isViewer)).toMatchObject({ points: 15 });

    // The class archived: nothing the student or the teacher reads of it moves.
    await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "ARCHIVED", statusChangedAt: at(-5 * MINUTE) } });
    expect(await history(client)).toEqual(historyBefore);
    expect(await client.get(`/api/me/activities/${graded.activity.id}`).then((res) => [res.status, res.body])).toEqual([200, review.body]);
    expect(
      await teacherClient
        .get(`/api/classes/${schoolClass.id}/activities/${graded.activity.id}/attempts/${delivered.attemptId}`)
        .then((res) => [res.status, res.body]),
    ).toEqual([200, attemptView.body]);
    expect((await detail(graded.activity.id)).roster.find((entry) => entry.studentUserId === student.id)).toEqual(rosterBefore);
    expect(await ranking(client)).toEqual(rankingBefore);
    // The cancelled work stays out of every student route but the Histórico.
    expect((await client.get(`/api/me/activities/${cancelled.activity.id}`)).status).toBe(404);
  });
});
