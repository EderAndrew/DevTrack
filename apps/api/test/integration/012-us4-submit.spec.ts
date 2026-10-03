import type { Answer, StudentActivity } from "@repo/contracts";
import { StudentActivitySchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type CreateActivityOptions, type CreatedActivity, createActivity, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 012/US4 — the student submits: one transaction that writes the pending answers under the revision
 * rule, registers the submission with the server clock and the late flag, counts the blank questions
 * (FR-023), grades multiple choice by the 011 rules (open answers and code pending for the teacher)
 * and audits it; a repeat returns the same submission, and nothing changes it afterwards. No grade
 * reaches the student before the release.
 */

const START = "2026-10-01T12:00:00.000Z";

describe("012/US4 aluno entrega a atividade", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let client: ReturnType<typeof api>;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /** Multiple choice 0,30 + 0,20, open answer 0,30 and code 0,20 (starter code "class Main {}"). */
  const activityOf = (options: CreateActivityOptions = {}): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 30, correctIndex: 0 },
        { type: "MULTIPLE_CHOICE", valueCents: 20, correctIndex: 1 },
        { type: "OPEN_ANSWER", valueCents: 30 },
        { type: "CODE", valueCents: 20, starterCode: "class Main {}" },
      ],
      ...options,
    });
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const choice = (alternativeId: string | null): Answer => ({ kind: "ALTERNATIVE", alternativeId });
  const code = (source: string): Answer => ({ kind: "CODE", source });
  const start = async (activityId: string) => expect((await startAttempt(client, activityId)).status).toBe(200);
  const submit = async (activityId: string, answers: { questionId: string; answer: Answer; baseRevision: number }[] = []) => {
    const res = await submitAttempt(client, activityId, answers);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return StudentActivitySchema.parse(res.body) satisfies StudentActivity;
  };
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    student = await createUser(t, { roles: ["STUDENT"] });
    client = api(t, { cookie: await loginAs(t, student) });
    schoolClass = await createClass(t, teacher.id, { name: "POO 2026.2" });
    await createEnrollment(t, schoolClass.id, student.id);
  });

  it("012/US4-1 012/FR-024 012/SC-008 entregar no prazo grava as pendentes, registra a entrega e o professor a vê", async () => {
    const { activity, questionIds, alternativeIds } = await activityOf();
    await start(activity.id);
    await saveAnswers(client, activity.id, [{ questionId: questionIds[2]!, answer: text("Reuso"), baseRevision: 0 }]);
    clock.advance(10 * MINUTE);

    const view = await submit(activity.id, [
      { questionId: questionIds[0]!, answer: choice(alternativeIds[0]![0]!), baseRevision: 0 },
      { questionId: questionIds[2]!, answer: text("Reuso"), baseRevision: 1 },
    ]);
    expect(view.status).toBe("SUBMITTED");
    expect(view.canAnswer).toBe(false);
    expect(view.submittedAt).toBe(at(0).toISOString());
    expect(view.submission).toEqual({ submittedAt: at(0).toISOString(), late: false, acceptedByTeacher: false, blankCount: 2 });
    expect(view.attempt!.answers).toHaveLength(2);

    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id }, include: { submission: true } });
    expect(attempt.status).toBe("SUBMITTED");
    expect(attempt.submission).toMatchObject({ submittedAt: at(0), late: false, blankCount: 2, acceptedById: null });
    const [created, ...more] = await events("activity_submission.created");
    expect(more).toEqual([]);
    expect(created).toMatchObject({
      actorUserId: student.id,
      targetType: "ACTIVITY_SUBMISSION",
      targetId: attempt.submission!.id,
      metadata: { activityId: activity.id, attemptId: attempt.id, late: false, blankCount: 2, questionCount: 4, pendingTeacherCount: 2 },
    });

    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const detail = (await teacherClient.get(`/api/classes/${schoolClass.id}/activities/${activity.id}`)).body;
    expect(detail.roster).toEqual([expect.objectContaining({ studentUserId: student.id, status: "SUBMITTED", attemptId: attempt.id, submittedAt: at(0).toISOString() })]);
    expect(detail.counts).toMatchObject({ submitted: 1, pendingGrading: 1 });
  });

  it("012/US4-1 012/FR-027 012/FR-028 MC corrigida (certa = valor, errada e em branco = 0), aberta e código pendentes, nota parcial; nada de nota ao aluno", async () => {
    const { activity, questionIds, alternativeIds } = await activityOf();
    await start(activity.id);
    const view = await submit(activity.id, [
      { questionId: questionIds[0]!, answer: choice(alternativeIds[0]![0]!), baseRevision: 0 },
      { questionId: questionIds[1]!, answer: choice(alternativeIds[1]![0]!), baseRevision: 0 },
      { questionId: questionIds[3]!, answer: code("class Main { int x; }"), baseRevision: 0 },
    ]);

    const submission = await t.prisma.activitySubmission.findFirstOrThrow({ where: { activityId: activity.id }, include: { gradings: true } });
    expect([submission.grade.toFixed(2), submission.gradePartial]).toEqual(["0.30", true]);
    const byQuestion = new Map(submission.gradings.map((grading) => [grading.questionId, grading]));
    expect(questionIds.map((id) => [byQuestion.get(id)!.status, byQuestion.get(id)!.nature, byQuestion.get(id)!.finalGrade?.toFixed(2) ?? null, byQuestion.get(id)!.pendingReason])).toEqual([
      ["GRADED", "RULE_RESULT", "0.30", null],
      ["GRADED", "RULE_RESULT", "0.00", null],
      ["PENDING_TEACHER", null, null, "AI_REVIEW_UNAVAILABLE"],
      ["PENDING_TEACHER", null, null, "NO_TEST_CASES"],
    ]);
    // The open answer was blank: still pending for the teacher, never an automatic 0.
    expect(submission.blankCount).toBe(1);
    expect(view.result).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/"grade"|feedback|finalGrade|pendingReason/);
  });

  it("012/FR-023 em branco: sem resposta, MC sem alternativa, texto só com espaços, código vazio ou igual ao inicial", async () => {
    const { activity, questionIds } = await activityOf();
    await start(activity.id);
    const view = await submit(activity.id, [
      { questionId: questionIds[1]!, answer: choice(null), baseRevision: 0 },
      { questionId: questionIds[2]!, answer: text("   \n "), baseRevision: 0 },
      { questionId: questionIds[3]!, answer: code("class Main {}"), baseRevision: 0 },
    ]);
    expect(view.submission!.blankCount).toBe(4);
  });

  it("012/US4-2 012/FR-025 repetir devolve a mesma entrega sem evento; salvar depois → 409 ATTEMPT_ALREADY_SUBMITTED", async () => {
    const { activity, questionIds } = await activityOf();
    await start(activity.id);
    const first = await submit(activity.id, [{ questionId: questionIds[2]!, answer: text("uma"), baseRevision: 0 }]);
    clock.advance(MINUTE);
    // The repeat after a dropped connection resends the same body: same submission, nothing written.
    const again = await submit(activity.id, [{ questionId: questionIds[2]!, answer: text("outra"), baseRevision: 0 }]);
    expect(again.submission).toEqual(first.submission);
    expect(await t.prisma.activitySubmission.count()).toBe(1);
    expect(await events("activity_submission.created")).toHaveLength(1);
    expect((await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: questionIds[2]! } })).text).toBe("uma");

    const save = await saveAnswers(client, activity.id, [{ questionId: questionIds[2]!, answer: text("tarde"), baseRevision: 1 }]);
    expect([save.status, save.body.code]).toEqual([409, "ATTEMPT_ALREADY_SUBMITTED"]);
  });

  it("012/FR-025 revisão antiga com outro conteúdo → 409 ANSWER_CHANGED_ELSEWHERE, nada entregue, a resposta mais nova intacta", async () => {
    const { activity, questionIds } = await activityOf();
    await start(activity.id);
    await saveAnswers(client, activity.id, [{ questionId: questionIds[2]!, answer: text("aba A"), baseRevision: 0 }]);
    await saveAnswers(client, activity.id, [{ questionId: questionIds[2]!, answer: text("aba A, mais nova"), baseRevision: 1 }]);

    const res = await submitAttempt(client, activity.id, [
      { questionId: questionIds[3]!, answer: code("class B {}"), baseRevision: 0 },
      { questionId: questionIds[2]!, answer: text("aba B"), baseRevision: 1 },
    ]);
    expect([res.status, res.body.code]).toEqual([409, "ANSWER_CHANGED_ELSEWHERE"]);
    expect(await t.prisma.activitySubmission.count()).toBe(0);
    expect((await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } })).status).toBe("IN_PROGRESS");
    expect((await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: questionIds[2]! } })).text).toBe("aba A, mais nova");
    expect(await t.prisma.activityAnswer.count({ where: { questionId: questionIds[3]! } })).toBe(0);
    expect((await events("activity_submission.rejected")).map((event) => event.metadata)).toEqual([{ operation: "SUBMIT", code: "ANSWER_CHANGED_ELSEWHERE" }]);

    // The same content with the old revision is UNCHANGED, not a conflict.
    const ok = await submit(activity.id, [{ questionId: questionIds[2]!, answer: text("aba A, mais nova"), baseRevision: 1 }]);
    expect(ok.status).toBe("SUBMITTED");
  });

  it("012/US4-5 012/US4-6 012/FR-024a depois do prazo: REJECT → 409 DEADLINE_PASSED com as respostas preservadas; ACCEPT_MARKED → late", async () => {
    const rejecting = await activityOf({ deadline: at(HOUR) });
    const accepting = await activityOf({ deadline: at(HOUR), latePolicy: "ACCEPT_MARKED" });
    await start(rejecting.activity.id);
    await start(accepting.activity.id);
    await saveAnswers(client, rejecting.activity.id, [{ questionId: rejecting.questionIds[2]!, answer: text("salva"), baseRevision: 0 }]);
    clock.advance(HOUR + 1);

    const refused = await submitAttempt(client, rejecting.activity.id, []);
    expect([refused.status, refused.body.code]).toEqual([409, "DEADLINE_PASSED"]);
    expect((await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: rejecting.questionIds[2]! } })).text).toBe("salva");
    expect((await events("activity_submission.rejected")).map((event) => event.metadata)).toEqual([{ operation: "SUBMIT", code: "DEADLINE_PASSED" }]);

    const late = await submit(accepting.activity.id);
    expect(late.submission!.late).toBe(true);
    expect(late.late).toBe(true);
    expect((await events("activity_submission.created"))[0]!.metadata).toMatchObject({ late: true });
  });

  it("012/US4-5 encerrada → 409 ACTIVITY_CLOSED; sem iniciar → 409 NOT_STARTED; matrícula removida → 404", async () => {
    const closed = await activityOf();
    await start(closed.activity.id);
    await t.prisma.classActivity.update({ where: { id: closed.activity.id }, data: { status: "CLOSED", closedAt: at(0) } });
    const res = await submitAttempt(client, closed.activity.id, []);
    expect([res.status, res.body.code]).toEqual([409, "ACTIVITY_CLOSED"]);

    const notStarted = await activityOf();
    const res2 = await submitAttempt(client, notStarted.activity.id, []);
    expect([res2.status, res2.body.code]).toEqual([409, "NOT_STARTED"]);

    const removed = await activityOf();
    await start(removed.activity.id);
    await t.prisma.enrollment.updateMany({ where: { studentUserId: student.id }, data: { status: "REMOVED", removedAt: at(0), removedById: teacher.id } });
    const res3 = await submitAttempt(client, removed.activity.id, []);
    expect([res3.status, res3.body.code]).toEqual([404, "NOT_FOUND"]);
    expect((await events("student_access.denied")).map((event) => event.metadata)).toEqual([
      { route: "/me/activities/:activityId/attempt/submit", reason: "NOT_ENROLLED" },
    ]);
    expect(await t.prisma.activitySubmission.count()).toBe(0);
  });

  it("012/FR-020 resposta inválida na entrega → 422 INVALID_ANSWER e nada entregue; corpo estrito → 400", async () => {
    const { activity, questionIds } = await activityOf();
    const other = await activityOf();
    await start(activity.id);
    const invalid = await submitAttempt(client, activity.id, [{ questionId: questionIds[0]!, answer: choice(other.alternativeIds[0]![0]!), baseRevision: 0 }]);
    expect([invalid.status, invalid.body.code]).toEqual([422, "INVALID_ANSWER"]);
    const strict = await client.post(`/api/me/activities/${activity.id}/attempt/submit`, { answers: [], late: false });
    expect([strict.status, strict.body.code]).toEqual([400, "VALIDATION_ERROR"]);
    expect(await t.prisma.activitySubmission.count()).toBe(0);
  });
});
