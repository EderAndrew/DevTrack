import type { StudentActivity, TeacherActivity, TeacherAttempt, TeacherExam } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, getAttempt, gradeAttempt, releaseResult, saveAnswers, submitAttempt } from "../helpers/activities";
import { getAttemptPauses, markPresent, pauseStudent, releasePause } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, decideHold, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 018/US8 — the teacher grades and releases an exam with its facts (018/FR-029…FR-031): the 012
 * grading as it is, the roster's situations, each attempt's start, end, reason, occurrences, pauses and
 * decisions; after the release the student sees the grade with their own occurrences and pauses, and a
 * cancelled attempt as "cancelada" with zero. Occurrences and pauses never change a grade by themselves.
 *
 * The clock starts at the real time: the hold's trigger checks a return against the database clock.
 */

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();
const SECOND = 1000;
type Client = ReturnType<typeof api>;

describe("018/US8 professor corrige e libera o resultado vendo as ocorrências", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let exam: TeacherExam;
  let activity: TeacherActivity;

  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const detail = async (student: Client) => {
    const res = await student.get(`/api/me/activities/${activity.id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentActivity;
  };
  const teacherActivity = async () => {
    const res = await client.get(`/api/classes/${classId}/activities/${activity.id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as TeacherActivity;
  };
  const teacherAttempt = async (attemptId: string) => {
    const res = await getAttempt(client, classId, activity.id, attemptId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as TeacherAttempt;
  };
  const attemptOf = (student: TestUser) => t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: student.id } });
  const question = (type: string) => activity.questions.find((item) => item.type === type)!;
  const rightAnswer = () => {
    const choice = question("MULTIPLE_CHOICE");
    return { questionId: choice.id, answer: { kind: "ALTERNATIVE" as const, alternativeId: choice.alternatives.find((alt) => alt.isCorrect)!.id }, baseRevision: 0 };
  };
  const occur = async (student: Client) => {
    const res = await recordEvents(student, activity.id, [integrityEvent("SCREEN_LEFT")]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    clock.advance(5 * SECOND);
  };
  /** Starts and saves the right alternative; `occurrences` countable events after it. */
  const started = async (student: TestUser, occurrences = 0) => {
    const c = await studentClient(student);
    expect((await startExam(c, activity.id)).status).toBe(200);
    expect((await saveAnswers(c, activity.id, [rightAnswer()])).status).toBe(200);
    for (let i = 0; i < occurrences; i += 1) await occur(c);
    return c;
  };
  const holdOf = async (student: TestUser) => t.prisma.examAttemptHold.findFirstOrThrow({ where: { attemptId: (await attemptOf(student)).id, resolution: null } });
  /** Grades every pending question of a submitted attempt with 0, so the release has a complete grading. */
  const gradePending = async (student: TestUser) => {
    const attempt = await teacherAttempt((await attemptOf(student)).id);
    const pending = attempt.submission!.gradings.filter((grading) => grading.finalGrade === null);
    if (pending.length === 0) return attempt;
    const res = await gradeAttempt(client, classId, activity.id, attempt.id, {
      version: attempt.submission!.version,
      decisions: pending.map((grading) => ({ questionId: grading.questionId, grade: "0.00" })),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as TeacherAttempt;
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
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 6 });
    classId = created.schoolClass.id;
    students = created.students;
    exam = await approvedExam(t, client, syllabus);
    // Every student present but the last one (absent); 30 minutes, start window 15.
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, durationMinutes: 30, attendance: "NONE" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    activity = res.body as TeacherActivity;
    const present = await markPresent(client, classId, activity.id, students.slice(0, 5).map((s) => s.id));
    expect(present.status, JSON.stringify(present.body)).toBe(200);
  });

  it("018/US8-1 o roster mostra a situação de cada aluno e o número de ocorrências", async () => {
    // 0 not started, 1 answering with 2 occurrences, 2 paused, 3 awaiting decision, 4 submitted, 5 absent.
    await started(students[1]!, 2);
    await started(students[2]!);
    expect((await pauseStudent(client, classId, activity.id, students[2]!.id)).status).toBe(201);
    await started(students[3]!, 4);
    const submitter = await started(students[4]!, 1);
    expect((await submitAttempt(submitter, activity.id)).status).toBe(200);

    const roster = new Map((await teacherActivity()).roster.map((row) => [row.studentUserId, row]));
    const row = (index: number) => roster.get(students[index]!.id)!;
    expect([0, 1, 2, 3, 4, 5].map((index) => row(index).status)).toEqual(["NOT_STARTED", "IN_PROGRESS", "IN_PROGRESS", "AWAITING_DECISION", "SUBMITTED", "ABSENT"]);
    expect(row(2).pauses.open).toBe(true);
    expect([0, 1, 2, 3, 4, 5].map((index) => row(index).occurrenceCount)).toEqual([0, 2, 0, 4, 1, 0]);
  });

  it("018/US8-2 018/US8-3 018/FR-030 tempo esgotado, cancelada, devolvida e entregue: corrigidas e liberadas pela 012", async () => {
    await started(students[0]!); // time expired with the open answer and the code blank
    await started(students[1]!, 4); // cancelled
    const returned = await started(students[2]!, 4); // returned, then submitted
    const submitter = await started(students[3]!, 2); // submitted with 2 occurrences
    expect((await decideHold(client, classId, activity.id, (await holdOf(students[1]!)).id, "cancel")).status).toBe(200);
    expect((await decideHold(client, classId, activity.id, (await holdOf(students[2]!)).id, "return")).status).toBe(200);
    expect((await submitAttempt(returned, activity.id)).status).toBe(200);
    expect((await submitAttempt(submitter, activity.id)).status).toBe(200);

    clock.advance(31 * MINUTE);
    const roster = new Map((await teacherActivity()).roster.map((row) => [row.studentUserId, row]));
    expect([0, 1, 2, 3].map((index) => roster.get(students[index]!.id)!.status)).toEqual(["TIME_EXPIRED", "CANCELLED", "SUBMITTED", "SUBMITTED"]);

    // US8-3: the expired attempt is complete without the teacher: the blanks score zero, the choice by the rule.
    const expired = await teacherAttempt((await attemptOf(students[0]!)).id);
    expect(expired.submission).toMatchObject({ gradePartial: false, blankCount: 2 });
    const choiceValue = question("MULTIPLE_CHOICE").value;
    expect(expired.submission!.grade).toBe(choiceValue);
    // US8-2: the cancelled one is decided at zero, nothing pending.
    expect((await teacherAttempt((await attemptOf(students[1]!)).id)).submission).toMatchObject({ grade: "0.00", gradePartial: false });
    // FR-030: occurrences change nothing: the submitted ones get the rule's grade on the choice, the rest from the teacher.
    for (const index of [2, 3]) expect((await gradePending(students[index]!)).submission).toMatchObject({ grade: choiceValue, gradePartial: false });

    const released = await releaseResult(client, classId, activity.id);
    expect(released.status, JSON.stringify(released.body)).toBe(200);
    const cancelled = await detail(await studentClient(students[1]!));
    expect(cancelled.exam!.endReason).toBe("CANCELLED");
    expect(cancelled.result).toMatchObject({ grade: "0.00" });
    const expiredView = await detail(await studentClient(students[0]!));
    expect(expiredView.exam!.endReason).toBe("TIME_EXPIRED");
    expect(expiredView.result!.grade).toBe(choiceValue);
  });

  it("018/FR-029 antes da liberação, cancelamento confirmado e \"Não cancelar\" chegam ao aluno iguais, sem a decisão", async () => {
    const cancelled = await started(students[0]!, 4);
    const kept = await started(students[1]!, 4);
    expect((await decideHold(client, classId, activity.id, (await holdOf(students[0]!)).id, "cancel")).status).toBe(200);
    clock.advance(31 * MINUTE);
    expect((await decideHold(client, classId, activity.id, (await holdOf(students[1]!)).id, "keep")).status).toBe(200);

    const shape = (view: StudentActivity) => ({ endReason: view.exam!.endReason, result: view.result, submitted: view.submission !== null });
    const [a, b] = [await detail(cancelled), await detail(kept)];
    expect(shape(a)).toEqual({ endReason: "WARNINGS", result: null, submitted: true });
    expect(shape(b)).toEqual(shape(a));
    expect(JSON.stringify(a)).not.toMatch(/CANCEL_CONFIRMED|NOT_CANCELLED|resolvedBy|decisions/);
  });

  it("018/FR-031 ao abrir a tentativa, o professor vê início, fim, motivo, cada ocorrência, as pausas e as decisões com autor e horário", async () => {
    const student = await started(students[0]!, 4);
    const attemptId = (await attemptOf(students[0]!)).id;
    clock.advance(MINUTE);
    const decidedAt = clock.now().toISOString();
    expect((await decideHold(client, classId, activity.id, (await holdOf(students[0]!)).id, "return")).status).toBe(200);
    const pause = await pauseStudent(client, classId, activity.id, students[0]!.id);
    expect(pause.status, JSON.stringify(pause.body)).toBe(201);
    clock.advance(MINUTE);
    expect((await releasePause(client, classId, activity.id, pause.body.id)).status).toBe(200);
    clock.advance(MINUTE);
    expect((await submitAttempt(student, activity.id)).status).toBe(200);

    const attempt = await teacherAttempt(attemptId);
    expect(attempt.startedAt).toBe(START);
    expect(attempt.exam).toMatchObject({
      endsAt: new Date(new Date(START).getTime() + 30 * MINUTE).toISOString(),
      endedAt: attempt.submission!.submittedAt,
      endReason: "STUDENT_SUBMITTED",
    });
    expect(attempt.exam!.occurrences.map((occurrence) => [occurrence.ordinal, occurrence.kind])).toEqual([
      [1, "SCREEN_LEFT"],
      [2, "SCREEN_LEFT"],
      [3, "SCREEN_LEFT"],
      [4, "SCREEN_LEFT"],
    ]);
    expect(attempt.exam!.decisions).toEqual([
      expect.objectContaining({ occurrenceOrdinal: 4, resolution: "RETURNED", resolvedAt: decidedAt, resolvedBy: { name: "Ana Professora" } }),
    ]);
    const pauses = await getAttemptPauses(client, classId, activity.id, attemptId);
    expect(pauses.status).toBe(200);
    expect(pauses.body.items).toHaveLength(1);
  });

  it("018/US8-4 depois da liberação o aluno vê a nota, as próprias ocorrências e pausas, e nada de outro aluno", async () => {
    const mine = await started(students[0]!, 2);
    const other = await started(students[1]!, 3);
    // Before the end, the occurrences are only a count.
    expect((await detail(mine)).exam!.ownOccurrences).toEqual([]);
    const pause = await pauseStudent(client, classId, activity.id, students[0]!.id);
    clock.advance(MINUTE);
    expect((await releasePause(client, classId, activity.id, pause.body.id)).status).toBe(200);
    expect((await submitAttempt(mine, activity.id)).status).toBe(200);
    expect((await submitAttempt(other, activity.id)).status).toBe(200);
    await gradePending(students[0]!);
    await gradePending(students[1]!);
    expect((await releaseResult(client, classId, activity.id)).status).toBe(200);

    const view = await detail(mine);
    expect(view.result).not.toBeNull();
    expect(view.exam!.ownOccurrences.map((occurrence) => occurrence.ordinal)).toEqual([1, 2]);
    expect(view.pauses).toHaveLength(1);
    const text = JSON.stringify(view);
    expect(text).not.toContain(students[1]!.id);
    expect(text).not.toContain(students[1]!.name);
    // Never the key of a question outside the 012 rule (open answer, code).
    expect(text).not.toContain("Reuso por extensão de uma classe.");
    expect(text).not.toContain("class Soma {}");
  });

  it("018/US8-5 presente que nunca iniciou aparece como não iniciou, sem nota automática", async () => {
    const submitter = await started(students[1]!);
    expect((await submitAttempt(submitter, activity.id)).status).toBe(200);
    expect((await client.post(`/api/classes/${classId}/activities/${activity.id}/close`, {})).status).toBe(200);
    const row = (await teacherActivity()).roster.find((entry) => entry.studentUserId === students[0]!.id)!;
    expect(row).toMatchObject({ status: "START_CLOSED", attemptId: null, grade: null, submittedAt: null });
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id, studentUserId: students[0]!.id } })).toBe(0);
  });
});
