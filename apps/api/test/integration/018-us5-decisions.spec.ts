import type { ExamMonitor, IntegrityTimeline, StudentActivity, TeacherActivity, TeacherExam, TeacherExamHold } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyWork, createClassWithStudents, gradeAttempt, releaseResult, saveAnswers } from "../helpers/activities";
import { markPresent, pauseStudent } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, decideHold, getExamMonitor, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork } from "../helpers/works";

/**
 * 018/US5 — the teacher decides a hold (018/FR-021…FR-025, research T9, T10, T12): "Confirmar
 * cancelamento" writes the submission CANCELLED with every question decided 0 by the teacher;
 * "Devolver prova" resumes the attempt with the time left; "Não cancelar", only once the time is
 * over, settles it ENDED_BY_WARNINGS on the saved answers. One decision per hold. The release waits
 * for every decision, and the monitor shows each student's situation, refreshed by polling.
 *
 * The suite's clock starts at the real time: the hold's trigger checks a return against the database
 * clock (data-model "Holds"), the backstop of the service's check with the injected clock.
 */

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();
const SECOND = 1000;
type Client = ReturnType<typeof api>;

describe("018/US5 o professor decide: confirmar o cancelamento, devolver ou não cancelar", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let exam: TeacherExam;
  let syllabus: ConfirmedSyllabus;

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
  const decide = async (activityId: string, holdId: string, decision: "cancel" | "return" | "keep") => {
    const res = await decideHold(client, classId, activityId, holdId, decision);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as TeacherExamHold;
  };
  const refused = async (activityId: string, holdId: string, decision: "cancel" | "return" | "keep") => {
    const res = await decideHold(client, classId, activityId, holdId, decision);
    return [res.status, res.body.code];
  };
  const applied = async (overrides: Parameters<typeof applyExam>[3] = {}) => {
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  /** One countable event, then the clock moves past the grouping window. */
  const occur = async (student: Client, activityId: string) => {
    const res = await recordEvents(student, activityId, [integrityEvent("SCREEN_LEFT")]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    clock.advance(5 * SECOND);
    return res.body;
  };
  const multipleChoice = (activity: TeacherActivity) => {
    const question = activity.questions.find((item) => item.type === "MULTIPLE_CHOICE")!;
    return { questionId: question.id, answer: { kind: "ALTERNATIVE" as const, alternativeId: question.alternatives.find((alt) => alt.isCorrect)!.id } };
  };
  /** Student `index` starts the exam, saves the right alternative and reaches the 4th occurrence. */
  const held = async (activity: TeacherActivity, index = 0) => {
    const student = await studentClient(students[index]!);
    expect((await startExam(student, activity.id)).status).toBe(200);
    expect((await saveAnswers(student, activity.id, [{ ...multipleChoice(activity), baseRevision: 0 }])).status).toBe(200);
    for (let i = 0; i < 4; i += 1) await occur(student, activity.id);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: students[index]!.id } });
    const hold = await t.prisma.examAttemptHold.findFirstOrThrow({ where: { attemptId: attempt.id, resolution: null } });
    return { student, attempt, hold };
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
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 3 });
    classId = created.schoolClass.id;
    students = created.students;
    exam = await approvedExam(t, client, syllabus);
  });

  it("018/US5-1 018/US5-8 018/FR-021 confirmar o cancelamento: submissão CANCELLED, cada questão decidida 0 pelo professor, auditada", async () => {
    const activity = await applied();
    const { student, attempt, hold } = await held(activity);
    // US5-8: nothing is graded or submitted before the decision.
    expect(await t.prisma.activitySubmission.count({ where: { attemptId: attempt.id } })).toBe(0);

    clock.advance(MINUTE);
    const decided = await decide(activity.id, hold.id, "cancel");
    expect(decided).toEqual({
      id: hold.id,
      attemptId: attempt.id,
      occurrenceOrdinal: 4,
      openedAt: hold.openedAt.toISOString(),
      resolution: "CANCEL_CONFIRMED",
      resolvedAt: clock.now().toISOString(),
      canReturn: false,
    });
    const stored = await t.prisma.examAttemptHold.findUniqueOrThrow({ where: { id: hold.id } });
    expect([stored.resolution, stored.resolvedById, stored.resolvedAt]).toEqual(["CANCEL_CONFIRMED", teacher.id, clock.now()]);

    const submission = await t.prisma.activitySubmission.findUniqueOrThrow({ where: { attemptId: attempt.id }, include: { gradings: true } });
    expect(submission).toMatchObject({ endReason: "CANCELLED", cancelledById: teacher.id, gradePartial: false, late: false, submittedAt: hold.openedAt });
    expect(submission.grade.toFixed(2)).toBe("0.00");
    expect(submission.gradings).toHaveLength(activity.questions.length);
    for (const grading of submission.gradings) {
      expect(grading).toMatchObject({ status: "DECIDED", nature: "HUMAN_DECISION", decidedById: teacher.id, decidedAt: clock.now() });
      expect(grading.finalGrade!.toFixed(2)).toBe("0.00");
    }
    expect((await auditOf("exam_attempt.cancel_confirmed")).map((event) => [event.actorType, event.actorUserId, event.targetId, event.metadata])).toEqual([
      ["USER", teacher.id, attempt.id, { activityId: activity.id, holdId: hold.id, submissionId: submission.id }],
    ]);

    // Before the release the student sees only "Prova encerrada" (FR-029): the same as "Não cancelar".
    const before = await detail(student, activity.id);
    expect(before.exam).toMatchObject({ hold: null, endReason: "WARNINGS" });
    expect(JSON.stringify(before)).not.toContain("CANCELLED");
    // The zero is the teacher's decision: grading it again is refused.
    const regrade = await gradeAttempt(client, classId, activity.id, attempt.id, {
      version: submission.version,
      decisions: [{ questionId: activity.questions[0]!.id, grade: "1.00" }],
    });
    expect([regrade.status, regrade.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);

    // After the release: "Prova cancelada pelo professor" with the zero.
    expect((await releaseResult(client, classId, activity.id)).status).toBe(200);
    const after = await detail(student, activity.id);
    expect(after.exam!.endReason).toBe("CANCELLED");
    expect(after.result!.grade).toBe("0.00");
  });

  it("018/US5-2 018/FR-022 018/SC-006 devolver com tempo: a tentativa continua com as respostas salvas e o fim original", async () => {
    const activity = await applied();
    const { student, attempt, hold } = await held(activity);
    const endsAt = new Date(attempt.startedAt.getTime() + 60 * MINUTE);
    clock.advance(10 * MINUTE);

    const decided = await decide(activity.id, hold.id, "return");
    expect(decided).toMatchObject({ resolution: "RETURNED", resolvedAt: clock.now().toISOString(), canReturn: false });
    const secondsLeft = Math.floor((endsAt.getTime() - clock.now().getTime()) / SECOND);
    expect((await auditOf("exam_attempt.returned")).map((event) => [event.actorUserId, event.targetId, event.metadata])).toEqual([
      [teacher.id, attempt.id, { activityId: activity.id, holdId: hold.id, secondsLeft }],
    ]);

    // Any device, at the next poll: the questions and every saved answer, the end never moved.
    const view = await detail(await studentClient(students[0]!), activity.id);
    expect(view.exam).toMatchObject({ hold: null, endReason: null, endsAt: endsAt.toISOString(), occurrences: { count: 4, warningsAllowed: 3 } });
    expect(view.questions).toHaveLength(activity.questions.length);
    expect(view.attempt!.answers.map((answer) => answer.questionId)).toEqual([multipleChoice(activity).questionId]);
    expect(await t.prisma.activityAttempt.findUniqueOrThrow({ where: { id: attempt.id }, select: { status: true } })).toEqual({ status: "IN_PROGRESS" });
    // The student writes again.
    expect((await saveAnswers(student, activity.id, [{ ...multipleChoice(activity), answer: { kind: "ALTERNATIVE", alternativeId: null }, baseRevision: 1 }])).status).toBe(200);
  });

  it("018/US5-3 depois da devolução, a ocorrência seguinte encerra de novo e volta a aguardar a decisão", async () => {
    const activity = await applied();
    const { student, attempt, hold } = await held(activity);
    await decide(activity.id, hold.id, "return");
    const fifth = await occur(student, activity.id);
    expect(fifth.exam).toEqual({ occurrenceCount: 5, held: true });
    const holds = await t.prisma.examAttemptHold.findMany({ where: { attemptId: attempt.id }, orderBy: { occurrenceOrdinal: "asc" } });
    expect(holds.map((row) => [row.occurrenceOrdinal, row.resolution])).toEqual([
      [4, "RETURNED"],
      [5, null],
    ]);
    expect((await monitor(activity.id)).students[0]).toMatchObject({ examStatus: "AWAITING_DECISION", occurrenceCount: 5, openHold: { id: holds[1]!.id, canReturn: true } });
    expect(await auditOf("exam_attempt.held")).toHaveLength(2);
  });

  it("018/US5-4 018/US5-5 018/FR-023 com o tempo esgotado devolver é recusado; “Não cancelar” vale as respostas salvas", async () => {
    const activity = await applied({ durationMinutes: 30 });
    const { student, attempt, hold } = await held(activity);
    // Before the end, not cancelling is returning: refused.
    expect(await refused(activity.id, hold.id, "keep")).toEqual([409, "EXAM_TIME_NOT_OVER"]);

    clock.set(new Date(attempt.startedAt.getTime() + 30 * MINUTE).toISOString());
    const row = (await monitor(activity.id)).students.find((item) => item.attemptId === attempt.id)!;
    // The time running out never settles an attempt on hold; the interface offers only the two decisions.
    expect(row).toMatchObject({ examStatus: "AWAITING_DECISION", openHold: { id: hold.id, canReturn: false } });
    expect(await refused(activity.id, hold.id, "return")).toEqual([409, "EXAM_TIME_OVER"]);
    expect(await auditOf("exam_attempt.returned")).toEqual([]);

    const kept = await decide(activity.id, hold.id, "keep");
    expect(kept).toMatchObject({ resolution: "NOT_CANCELLED", canReturn: false });
    const submission = await t.prisma.activitySubmission.findUniqueOrThrow({ where: { attemptId: attempt.id }, include: { gradings: true } });
    expect(submission).toMatchObject({ endReason: "ENDED_BY_WARNINGS", cancelledById: null, late: false, submittedAt: hold.openedAt });
    // The saved multiple choice is graded by the rule; the others go to the teacher as in 012.
    const mc = submission.gradings.find((grading) => grading.questionId === multipleChoice(activity).questionId)!;
    expect([mc.status, mc.nature]).toEqual(["GRADED", "RULE_RESULT"]);
    expect(mc.finalGrade!.toFixed(2)).not.toBe("0.00");
    expect(submission.gradings.filter((grading) => grading.status === "DECIDED")).toEqual([]);
    expect((await auditOf("exam_attempt.not_cancelled")).map((event) => [event.actorUserId, event.metadata])).toEqual([
      [teacher.id, { activityId: activity.id, holdId: hold.id, submissionId: submission.id }],
    ]);
    expect(await auditOf("exam_attempt.time_expired")).toEqual([]);
    expect((await monitor(activity.id)).students.find((item) => item.attemptId === attempt.id)).toMatchObject({ examStatus: "ENDED_BY_WARNINGS", openHold: null });
    expect((await detail(student, activity.id)).exam).toMatchObject({ hold: null, endReason: "WARNINGS" });
  });

  it("018/US5-6 018/FR-024 a liberação é recusada enquanto houver retenção aberta; depois da decisão, liberada", async () => {
    const activity = await applied();
    const first = await held(activity, 0);
    const second = await held(activity, 1);
    const release = await releaseResult(client, classId, activity.id);
    expect([release.status, release.body.code, release.body.details]).toEqual([409, "EXAM_DECISIONS_PENDING", { count: 2 }]);
    expect(await auditOf("activity_result.released")).toEqual([]);
    const view = (await client.get(`/api/classes/${classId}/activities/${activity.id}`)).body as TeacherActivity;
    expect(view.exam!.pendingDecisions).toBe(2);

    await decide(activity.id, first.hold.id, "cancel");
    expect((await releaseResult(client, classId, activity.id)).body.details).toEqual({ count: 1 });
    await decide(activity.id, second.hold.id, "cancel");
    expect((await releaseResult(client, classId, activity.id)).status).toBe(200);
    expect(await auditOf("activity_result.released")).toHaveLength(1);
  });

  it("018/US5-7 uma decisão repetida é recusada como transição inválida, sem segundo evento", async () => {
    const activity = await applied();
    const { hold } = await held(activity);
    await decide(activity.id, hold.id, "return");
    for (const decision of ["return", "cancel", "keep"] as const) {
      expect(await refused(activity.id, hold.id, decision), decision).toEqual([409, "INVALID_STATE_TRANSITION"]);
    }
    expect(await auditOf("exam_attempt.returned")).toHaveLength(1);
    expect(await auditOf("exam_attempt.cancel_confirmed")).toEqual([]);
  });

  it("018/FR-022 a prova encerrada ou cancelada pelo professor mantém as retenções decidíveis, sem devolver", async () => {
    const activity = await applied();
    const first = await held(activity, 0);
    const second = await held(activity, 1);
    expect((await client.post(`/api/classes/${classId}/activities/${activity.id}/close`, {})).status).toBe(200);
    // Closed: no return; the end is the close, so "Não cancelar" and the cancellation are open.
    expect(await refused(activity.id, first.hold.id, "return")).toEqual([409, "ACTIVITY_CLOSED"]);
    expect((await monitor(activity.id)).students.filter((row) => row.openHold).map((row) => row.openHold!.canReturn)).toEqual([false, false]);
    await decide(activity.id, first.hold.id, "keep");
    expect((await client.post(`/api/classes/${classId}/activities/${activity.id}/cancel`, {})).status).toBe(200);
    await decide(activity.id, second.hold.id, "cancel");
    const reasons = await t.prisma.activitySubmission.findMany({ where: { activityId: activity.id }, orderBy: { studentUserId: "asc" }, select: { studentUserId: true, endReason: true } });
    expect(new Map(reasons.map((row) => [row.studentUserId, row.endReason]))).toEqual(
      new Map([
        [students[0]!.id, "ENDED_BY_WARNINGS"],
        [students[1]!.id, "CANCELLED"],
      ]),
    );
  });

  it("018/FR-025 o monitor mostra a situação, o fim, as ocorrências, a retenção e a pausa; retidos primeiro, depois pausados", async () => {
    const activity = await applied({ attendance: "NONE" });
    // Students 0 and 1 present; 2 never marked.
    expect((await markPresent(client, classId, activity.id, [students[0]!.id, students[1]!.id])).status).toBe(200);
    let view = await monitor(activity.id);
    expect(view).toMatchObject({ activityId: activity.id, durationMinutes: 60, serverNow: clock.now().toISOString() });
    expect(new Map(view.students.map((row) => [row.studentUserId, row.examStatus]))).toEqual(
      new Map([
        [students[0]!.id, "PRESENT"],
        [students[1]!.id, "PRESENT"],
        [students[2]!.id, "NOT_MARKED"],
      ]),
    );

    const answering = await studentClient(students[1]!);
    expect((await startExam(answering, activity.id)).status).toBe(200);
    expect((await pauseStudent(client, classId, activity.id, students[1]!.id)).status).toBe(201);
    const { attempt, hold } = await held(activity, 0);
    view = await monitor(activity.id);
    expect(view.students.map((row) => row.examStatus)).toEqual(["AWAITING_DECISION", "PAUSED", "NOT_MARKED"]);
    expect(view.students[0]).toMatchObject({
      attemptId: attempt.id,
      startedAt: attempt.startedAt.toISOString(),
      endsAt: new Date(attempt.startedAt.getTime() + 60 * MINUTE).toISOString(),
      occurrenceCount: 4,
      openHold: { id: hold.id, resolution: null, canReturn: true },
      openPause: null,
    });
    expect(view.students[1]).toMatchObject({ occurrenceCount: 0, openHold: null, openPause: { endedAt: null, initiatedBy: "TEACHER" } });

    // Past the start window the absent student can no longer start; past the end the paused one is settled first.
    clock.advance(2 * 60 * MINUTE);
    view = await monitor(activity.id);
    expect(view.students.map((row) => row.examStatus)).toEqual(["AWAITING_DECISION", "TIME_EXPIRED", "NOT_MARKED"]);
    expect(await auditOf("exam_attempt.time_expired")).toHaveLength(1);
  });

  it("018/FR-025 o monitor só existe para a prova (409 NOT_AN_EXAM) e só para o professor da turma (404)", async () => {
    const work = await createWork(t, teacher.id, { syllabus });
    const workActivity = await applyWork(client, classId, work.id, { acknowledgeOutOfScope: true });
    const notExam = await getExamMonitor(client, classId, workActivity.body.id);
    expect([notExam.status, notExam.body.code]).toEqual([409, "NOT_AN_EXAM"]);

    const activity = await applied();
    const { hold } = await held(activity);
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherClient = api(t, { cookie: await loginAs(t, other) });
    expect((await getExamMonitor(otherClient, classId, activity.id)).status).toBe(404);
    for (const decision of ["cancel", "return", "keep"] as const) {
      expect((await decideHold(otherClient, classId, activity.id, hold.id, decision)).status, decision).toBe(404);
    }
    // A hold of another activity of the same class → 404.
    const another = await applied();
    expect((await decideHold(client, classId, another.id, hold.id, "cancel")).status).toBe(404);
    // A student → 403.
    const student = await studentClient(students[0]!);
    expect((await getExamMonitor(student, classId, activity.id)).status).toBe(403);
    expect((await decideHold(student, classId, activity.id, hold.id, "cancel")).status).toBe(403);
  });

  it("018/FR-031 a revisão de integridade traz o ordinal de cada ocorrência e as retenções com as decisões", async () => {
    const activity = await applied();
    const { student, attempt, hold } = await held(activity);
    await decide(activity.id, hold.id, "return");
    await occur(student, activity.id);
    const res = await client.get(`/api/classes/${classId}/activities/${activity.id}/attempts/${attempt.id}/integrity`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const timeline = res.body as IntegrityTimeline;
    expect(timeline.events.map((event) => event.occurrenceOrdinal)).toEqual([1, 2, 3, 4, 5]);
    expect(timeline.holds.map((item) => [item.occurrenceOrdinal, item.resolution, item.canReturn])).toEqual([
      [4, "RETURNED", false],
      [5, null, true],
    ]);
  });
});
