import { randomUUID } from "node:crypto";
import type { Answer, SaveAnswersResult, StudentActivity } from "@repo/contracts";
import { SaveAnswersResultSchema, StudentActivitySchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type CreateActivityOptions, type CreatedActivity, createActivity, saveAnswers, startAttempt } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 012/US3 — the student starts, answers and saves an activity: one attempt under repeated starts
 * (`INSERT … ON CONFLICT DO NOTHING`), one answer per question with a revision (SAVED / UNCHANGED /
 * CONFLICT, research P8), answers validated by the question's type and alternatives, the operation
 * rules of contracts/student-status.md with the server clock, the refusals audited with their code,
 * progress audited at most every 15 minutes, and the student view with the attempt but no grading
 * data. Code is stored as text and never run.
 */

const START = "2026-10-01T12:00:00.000Z";

describe("012/US3 aluno inicia, responde e salva uma atividade", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let client: ReturnType<typeof api>;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /** Open answer, multiple choice and code, published a day ago and due in a week (default). */
  const threeQuestions = (options: CreateActivityOptions = {}): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [
        { type: "OPEN_ANSWER", valueCents: 40, expectedAnswer: "Resposta esperada secreta", rubric: "Rubrica secreta" },
        { type: "MULTIPLE_CHOICE", valueCents: 30, alternatives: ["Certa", "Errada 1", "Errada 2"], correctIndex: 0, explanation: "Explicação secreta" },
        {
          type: "CODE",
          valueCents: 30,
          starterCode: "class Main {}",
          expectedSolution: "class Solucao { /* secreta */ }",
          testCases: [
            { input: "1", expectedOutput: "2", visibility: "PUBLIC" },
            { input: "privado", expectedOutput: "oculto", visibility: "PRIVATE" },
          ],
        },
      ],
      ...options,
    });
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const choice = (alternativeId: string | null): Answer => ({ kind: "ALTERNATIVE", alternativeId });
  const code = (source: string): Answer => ({ kind: "CODE", source });

  const start = async (activityId: string, who = client) => {
    const res = await startAttempt(who, activityId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return StudentActivitySchema.parse(res.body) satisfies StudentActivity;
  };
  const save = async (activityId: string, answers: { questionId: string; answer: Answer; baseRevision: number }[]) => {
    const res = await saveAnswers(client, activityId, answers);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return SaveAnswersResultSchema.parse(res.body) satisfies SaveAnswersResult;
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

  it("012/US3-1 012/FR-016 iniciar PENDENTE cria a tentativa, EM_ANDAMENTO e activity_attempt.started", async () => {
    const { activity } = await threeQuestions();
    const view = await start(activity.id);

    expect(view.status).toBe("IN_PROGRESS");
    expect(view.canAnswer).toBe(true);
    expect(view.attempt).toEqual({ number: 1, startedAt: START, lastSavedAt: null, answers: [] });
    const attempts = await t.prisma.activityAttempt.findMany({ where: { activityId: activity.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ studentUserId: student.id, number: 1, status: "IN_PROGRESS", startedAt: new Date(START) });
    const [started, ...more] = await events("activity_attempt.started");
    expect(more).toEqual([]);
    expect(started).toMatchObject({
      actorType: "USER",
      actorUserId: student.id,
      targetType: "ACTIVITY_ATTEMPT",
      targetId: attempts[0]!.id,
      metadata: { activityId: activity.id, classId: schoolClass.id, afterDeadline: false, attemptNumber: 1 },
    });
    expect(started!.requestId).not.toBeNull();
  });

  it("012/US3-2 012/SC-006 iniciar de novo, em paralelo ou em outra aba devolve a mesma tentativa, sem novo evento", async () => {
    const { activity } = await threeQuestions();
    const first = await start(activity.id);
    clock.advance(MINUTE);
    const results = await Promise.all(Array.from({ length: 5 }, () => startAttempt(client, activity.id)));
    expect(results.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
    for (const res of results) expect(res.body.attempt.startedAt).toBe(first.attempt!.startedAt);
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(1);
    expect(await events("activity_attempt.started")).toHaveLength(1);

    // Concurrent first starts converge too.
    const other = await threeQuestions();
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => startAttempt(client, other.activity.id)));
    expect(concurrent.map((res) => res.status)).toEqual(Array(10).fill(200));
    expect(await t.prisma.activityAttempt.count({ where: { activityId: other.activity.id } })).toBe(1);
    expect(await events("activity_attempt.started")).toHaveLength(2);
  });

  it("012/US3-3 012/US3-4 012/FR-017 salvar → SAVED com revisão 1→2; o mesmo conteúdo → UNCHANGED sem evento", async () => {
    const { activity, questionIds, alternativeIds } = await threeQuestions();
    await start(activity.id);
    const [open, multiple, codeQuestion] = questionIds as [string, string, string];

    clock.advance(MINUTE);
    const first = await save(activity.id, [
      { questionId: open, answer: text("Encapsulamento esconde o estado."), baseRevision: 0 },
      { questionId: multiple, answer: choice(alternativeIds[1]![1]!), baseRevision: 0 },
    ]);
    expect(first.savedAt).toBe(at(0).toISOString());
    expect(first.results).toEqual([
      { questionId: open, outcome: "SAVED", revision: 1 },
      { questionId: multiple, outcome: "SAVED", revision: 1 },
    ]);

    clock.advance(MINUTE);
    const second = await save(activity.id, [{ questionId: open, answer: text("Encapsulamento protege o estado."), baseRevision: 1 }]);
    expect(second.results).toEqual([{ questionId: open, outcome: "SAVED", revision: 2 }]);

    // A retry of what already landed: no new row, revision or event.
    const progressBefore = (await events("activity_attempt.progress_saved")).length;
    const retry = await save(activity.id, [{ questionId: open, answer: text("Encapsulamento protege o estado."), baseRevision: 1 }]);
    expect(retry.results).toEqual([{ questionId: open, outcome: "UNCHANGED", revision: 2 }]);
    expect(await t.prisma.activityAnswer.count({ where: { questionId: open } })).toBe(1);
    expect((await events("activity_attempt.progress_saved")).length).toBe(progressBefore);

    // 012/US3-8: code is stored as text, as sent, never run.
    const source = 'class Main { public static void main(String[] a) { System.exit(1); } }';
    expect((await save(activity.id, [{ questionId: codeQuestion, answer: code(source), baseRevision: 0 }])).results[0]!.outcome).toBe("SAVED");

    // Reload, another browser: the answers are there with their revisions.
    const otherBrowser = api(t, { cookie: await loginAs(t, student) });
    const reloaded = StudentActivitySchema.parse((await otherBrowser.get(`/api/me/activities/${activity.id}`)).body);
    expect(reloaded.attempt!.lastSavedAt).toBe(at(0).toISOString());
    expect(reloaded.attempt!.answers.sort((a, b) => questionIds.indexOf(a.questionId) - questionIds.indexOf(b.questionId))).toEqual([
      { questionId: open, answer: text("Encapsulamento protege o estado."), revision: 2 },
      { questionId: multiple, answer: choice(alternativeIds[1]![1]!), revision: 1 },
      { questionId: codeQuestion, answer: code(source), revision: 1 },
    ]);
    const stored = await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: codeQuestion } });
    expect(stored.source).toBe(source);
  });

  it("012/FR-017 baseRevision antiga com outro conteúdo → CONFLICT com a resposta e a revisão do servidor; itens independentes", async () => {
    const { activity, questionIds } = await threeQuestions();
    await start(activity.id);
    const [open, , codeQuestion] = questionIds as [string, string, string];
    await save(activity.id, [{ questionId: open, answer: text("aba A"), baseRevision: 0 }]);
    await save(activity.id, [{ questionId: open, answer: text("aba A de novo"), baseRevision: 1 }]);

    // Tab B still saw revision 1.
    const result = await save(activity.id, [
      { questionId: open, answer: text("aba B"), baseRevision: 1 },
      { questionId: codeQuestion, answer: code("int x;"), baseRevision: 0 },
    ]);
    expect(result.results).toEqual([
      { questionId: open, outcome: "CONFLICT", revision: 2, answer: text("aba A de novo") },
      { questionId: codeQuestion, outcome: "SAVED", revision: 1 },
    ]);
    const stored = await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: open } });
    expect([stored.text, stored.revision]).toEqual(["aba A de novo", 2]);
  });

  it("012/FR-020 alternativa de outra questão, tipo errado e questão de outra atividade → 422 INVALID_ANSWER; nada é gravado", async () => {
    const { activity, questionIds, alternativeIds } = await threeQuestions();
    const other = await threeQuestions();
    await start(activity.id);
    const [open, multiple, codeQuestion] = questionIds as [string, string, string];

    const refused = [
      [{ questionId: multiple, answer: choice(other.alternativeIds[1]![0]!), baseRevision: 0 }],
      [{ questionId: multiple, answer: choice(randomUUID()), baseRevision: 0 }],
      [{ questionId: open, answer: code("x"), baseRevision: 0 }],
      [{ questionId: codeQuestion, answer: text("x"), baseRevision: 0 }],
      [{ questionId: multiple, answer: text("A"), baseRevision: 0 }],
      [{ questionId: open, answer: choice(alternativeIds[1]![0]!), baseRevision: 0 }],
      [{ questionId: other.questionIds[0]!, answer: text("x"), baseRevision: 0 }],
      [{ questionId: randomUUID(), answer: text("x"), baseRevision: 0 }],
      // One valid item with one invalid: all or nothing.
      [
        { questionId: open, answer: text("válida"), baseRevision: 0 },
        { questionId: multiple, answer: choice(other.alternativeIds[1]![0]!), baseRevision: 0 },
      ],
    ];
    for (const answers of refused) {
      const res = await saveAnswers(client, activity.id, answers);
      expect([res.status, res.body.code], JSON.stringify(answers)).toEqual([422, "INVALID_ANSWER"]);
    }
    expect(await t.prisma.activityAnswer.count()).toBe(0);
    // A blank choice is a valid answer.
    expect((await save(activity.id, [{ questionId: multiple, answer: choice(null), baseRevision: 0 }])).results[0]!.outcome).toBe("SAVED");
  });

  it("012/FR-020 texto acima de 20 000, campos desconhecidos e questões repetidas → 400 VALIDATION_ERROR", async () => {
    const { activity, questionIds } = await threeQuestions();
    await start(activity.id);
    const [open] = questionIds as [string];
    const bodies = [
      { answers: [{ questionId: open, answer: text("a".repeat(20_001)), baseRevision: 0 }] },
      { answers: [{ questionId: open, answer: text("a"), baseRevision: 0, revision: 3 }] },
      { answers: [{ questionId: open, answer: text("a"), baseRevision: 0 }], studentUserId: student.id },
      { answers: [{ questionId: open, answer: { kind: "TEXT", text: "a", isCorrect: true }, baseRevision: 0 }] },
      { answers: [{ questionId: open, answer: text("a"), baseRevision: -1 }] },
      {
        answers: [
          { questionId: open, answer: text("a"), baseRevision: 0 },
          { questionId: open, answer: text("b"), baseRevision: 0 },
        ],
      },
      { answers: [] },
    ];
    for (const body of bodies) {
      const res = await client.put(`/api/me/activities/${activity.id}/attempt/answers`, body);
      expect([res.status, res.body.code]).toEqual([400, "VALIDATION_ERROR"]);
    }
    // Exactly 20 000 characters is accepted.
    expect((await save(activity.id, [{ questionId: open, answer: text("a".repeat(20_000)), baseRevision: 0 }])).results[0]!.outcome).toBe("SAVED");
  });

  it("012/FR-021 salvar sem iniciar → 409 NOT_STARTED, auditado como activity_submission.rejected", async () => {
    const { activity, questionIds } = await threeQuestions();
    const res = await saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("x"), baseRevision: 0 }]);
    expect([res.status, res.body.code]).toEqual([409, "NOT_STARTED"]);
    const [rejected] = await events("activity_submission.rejected");
    expect(rejected).toMatchObject({
      actorType: "USER",
      actorUserId: student.id,
      targetType: "CLASS_ACTIVITY",
      targetId: activity.id,
      metadata: { operation: "SAVE", code: "NOT_STARTED" },
    });
    expect(rejected!.requestId).not.toBeNull();
  });

  it("012/FR-021 012/US3-1 depois do prazo: REJECT recusa iniciar e salvar com DEADLINE_PASSED; ACCEPT_MARKED aceita", async () => {
    const rejecting = await threeQuestions({ deadline: at(HOUR) });
    const accepting = await threeQuestions({ deadline: at(HOUR), latePolicy: "ACCEPT_MARKED" });
    const notStarted = await threeQuestions({ deadline: at(HOUR) });
    await start(rejecting.activity.id);
    await start(accepting.activity.id);

    // At the deadline's instant it is still on time.
    clock.advance(HOUR);
    expect((await save(rejecting.activity.id, [{ questionId: rejecting.questionIds[0]!, answer: text("no limite"), baseRevision: 0 }])).results[0]!.outcome).toBe("SAVED");

    clock.advance(1);
    const late = await saveAnswers(client, rejecting.activity.id, [{ questionId: rejecting.questionIds[0]!, answer: text("tarde"), baseRevision: 1 }]);
    expect([late.status, late.body.code]).toEqual([409, "DEADLINE_PASSED"]);
    const lateStart = await startAttempt(client, notStarted.activity.id);
    expect([lateStart.status, lateStart.body.code]).toEqual([409, "DEADLINE_PASSED"]);
    expect(await t.prisma.activityAttempt.count({ where: { activityId: notStarted.activity.id } })).toBe(0);
    // The saved answer stays.
    expect((await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: rejecting.questionIds[0]! } })).text).toBe("no limite");

    expect((await save(accepting.activity.id, [{ questionId: accepting.questionIds[0]!, answer: text("tarde, aceita"), baseRevision: 0 }])).results[0]!.outcome).toBe(
      "SAVED",
    );
    const lateAccepted = await threeQuestions({ deadline: at(-MINUTE), latePolicy: "ACCEPT_MARKED" });
    const startedLate = await start(lateAccepted.activity.id);
    expect(startedLate.status).toBe("OVERDUE");
    expect(startedLate.canAnswer).toBe(true);
    const afterDeadline = (await events("activity_attempt.started")).map((event) => (event.metadata as { afterDeadline: boolean }).afterDeadline);
    expect(afterDeadline).toEqual([false, false, true]);

    expect((await events("activity_submission.rejected")).map((event) => event.metadata)).toEqual([
      { operation: "SAVE", code: "DEADLINE_PASSED" },
      { operation: "START", code: "DEADLINE_PASSED" },
    ]);
  });

  it("012/FR-021 encerrada → 409 ACTIVITY_CLOSED; turma INACTIVE → 409 CLASS_NOT_ACTIVE", async () => {
    const closed = await threeQuestions({ status: "CLOSED" });
    const res = await startAttempt(client, closed.activity.id);
    expect([res.status, res.body.code]).toEqual([409, "ACTIVITY_CLOSED"]);

    const open = await threeQuestions();
    await start(open.activity.id);
    await t.prisma.classActivity.update({ where: { id: open.activity.id }, data: { status: "CLOSED", closedAt: at(0) } });
    const saved = await saveAnswers(client, open.activity.id, [{ questionId: open.questionIds[0]!, answer: text("x"), baseRevision: 0 }]);
    expect([saved.status, saved.body.code]).toEqual([409, "ACTIVITY_CLOSED"]);

    const another = await threeQuestions();
    await start(another.activity.id);
    await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "INACTIVE" } });
    const inactiveSave = await saveAnswers(client, another.activity.id, [{ questionId: another.questionIds[0]!, answer: text("x"), baseRevision: 0 }]);
    expect([inactiveSave.status, inactiveSave.body.code]).toEqual([409, "CLASS_NOT_ACTIVE"]);
    const inactiveStart = await startAttempt(client, (await threeQuestions()).activity.id);
    expect([inactiveStart.status, inactiveStart.body.code]).toEqual([409, "CLASS_NOT_ACTIVE"]);

    expect((await events("activity_submission.rejected")).map((event) => event.metadata)).toEqual([
      { operation: "START", code: "ACTIVITY_CLOSED" },
      { operation: "SAVE", code: "ACTIVITY_CLOSED" },
      { operation: "SAVE", code: "CLASS_NOT_ACTIVE" },
      { operation: "START", code: "CLASS_NOT_ACTIVE" },
    ]);
  });

  it("012/FR-021 012/FR-008 matrícula removida → 404 (student_access.denied) e a tentativa fica preservada para o professor", async () => {
    const { activity, questionIds } = await threeQuestions();
    await start(activity.id);
    await save(activity.id, [{ questionId: questionIds[0]!, answer: text("antes de sair"), baseRevision: 0 }]);
    await t.prisma.enrollment.updateMany({
      where: { classId: schoolClass.id, studentUserId: student.id },
      data: { status: "REMOVED", removedAt: at(0), removedById: teacher.id },
    });

    const saved = await saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("depois"), baseRevision: 1 }]);
    expect([saved.status, saved.body.code]).toEqual([404, "NOT_FOUND"]);
    const started = await startAttempt(client, activity.id);
    expect([started.status, started.body.code]).toEqual([404, "NOT_FOUND"]);
    expect((await events("student_access.denied")).map((event) => event.metadata)).toEqual([
      { route: "/me/activities/:activityId/attempt/answers", reason: "NOT_ENROLLED" },
      { route: "/me/activities/:activityId/attempt", reason: "NOT_ENROLLED" },
    ]);
    expect(await events("activity_submission.rejected")).toEqual([]);

    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const roster = (await teacherClient.get(`/api/classes/${schoolClass.id}/activities/${activity.id}`)).body.roster;
    expect(roster).toEqual([expect.objectContaining({ studentUserId: student.id, enrollment: "REMOVED", status: "IN_PROGRESS" })]);
    expect((await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: questionIds[0]! } })).text).toBe("antes de sair");
  });

  it("012/FR-008 outra turma, agendada, cancelada e id inexistente → 404 em iniciar e salvar", async () => {
    const otherClass = await createClass(t, teacher.id, { name: "Turma alheia" });
    const foreign = await createActivity(t, otherClass, { publishAt: at(-DAY), deadline: at(DAY) });
    const scheduled = await threeQuestions({ publishAt: at(HOUR), deadline: at(DAY) });
    const cancelled = await threeQuestions({ status: "CANCELLED" });
    for (const id of [foreign.activity.id, scheduled.activity.id, cancelled.activity.id, randomUUID()]) {
      expect((await startAttempt(client, id)).status).toBe(404);
      expect((await saveAnswers(client, id, [{ questionId: randomUUID(), answer: text("x"), baseRevision: 0 }])).status).toBe(404);
    }
    expect(await t.prisma.activityAttempt.count()).toBe(0);
    expect((await events("student_access.denied")).map((event) => (event.metadata as { reason: string }).reason)).toEqual([
      "NOT_ENROLLED",
      "NOT_ENROLLED",
      "NOT_PUBLISHED",
      "NOT_PUBLISHED",
      "CANCELLED",
      "CANCELLED",
    ]);
  });

  it("012/FR-021 tentativa já entregue → salvar dá 409 ATTEMPT_ALREADY_SUBMITTED; iniciar devolve a mesma tentativa", async () => {
    const { activity, questionIds } = await threeQuestions();
    await start(activity.id);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } });
    await t.prisma.activityAttempt.update({ where: { id: attempt.id }, data: { status: "SUBMITTED" } });
    await t.prisma.activitySubmission.create({
      data: { attemptId: attempt.id, activityId: activity.id, studentUserId: student.id, submittedByUserId: student.id, submittedAt: at(0), late: false, blankCount: 3, grade: "0.00", gradePartial: true },
    });

    const res = await saveAnswers(client, activity.id, [{ questionId: questionIds[0]!, answer: text("x"), baseRevision: 0 }]);
    expect([res.status, res.body.code]).toEqual([409, "ATTEMPT_ALREADY_SUBMITTED"]);
    const again = await start(activity.id);
    expect(again.status).toBe("SUBMITTED");
    expect(await events("activity_attempt.started")).toHaveLength(1);
    expect((await events("activity_submission.rejected")).map((event) => event.metadata)).toEqual([{ operation: "SAVE", code: "ATTEMPT_ALREADY_SUBMITTED" }]);
  });

  it("012/FR-018 activity_attempt.progress_saved na primeira gravação e de novo só depois de 15 min, com contagens", async () => {
    const { activity, questionIds, alternativeIds } = await threeQuestions();
    await start(activity.id);
    const [open, multiple] = questionIds as [string, string];

    await save(activity.id, [{ questionId: open, answer: text("um"), baseRevision: 0 }]);
    clock.advance(14 * MINUTE);
    await save(activity.id, [{ questionId: open, answer: text("dois"), baseRevision: 1 }]);
    expect(await events("activity_attempt.progress_saved")).toHaveLength(1);

    clock.advance(MINUTE);
    await save(activity.id, [
      { questionId: open, answer: text("três"), baseRevision: 2 },
      { questionId: multiple, answer: choice(alternativeIds[1]![2]!), baseRevision: 0 },
    ]);
    const progress = await events("activity_attempt.progress_saved");
    expect(progress.map((event) => event.metadata)).toEqual([
      { activityId: activity.id, answeredCount: 1, questionCount: 3 },
      { activityId: activity.id, answeredCount: 2, questionCount: 3 },
    ]);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } });
    expect(progress[0]).toMatchObject({ targetType: "ACTIVITY_ATTEMPT", targetId: attempt.id, actorUserId: student.id });
    // Nothing written about the answers' content.
    expect(JSON.stringify(progress.map((event) => event.metadata))).not.toContain("três");
  });

  it("012/US3-7 012/US3-8 a visão com tentativa traz respostas e revisões, os casos públicos e nenhum dado de correção", async () => {
    const { activity, questionIds, alternativeIds } = await threeQuestions();
    await start(activity.id);
    await save(activity.id, [{ questionId: questionIds[1]!, answer: choice(alternativeIds[1]![0]!), baseRevision: 0 }]);

    const res = await client.get(`/api/me/activities/${activity.id}`);
    const view = StudentActivitySchema.parse(res.body);
    expect(view.attempt!.answers).toEqual([{ questionId: questionIds[1]!, answer: choice(alternativeIds[1]![0]!), revision: 1 }]);
    const codeQuestion = view.questions[2]!;
    expect(codeQuestion).toMatchObject({ starterCode: "class Main {}", language: { name: expect.any(String) }, publicTestCases: [{ input: "1", expectedOutput: "2" }] });
    expect(view.result).toBeNull();
    const raw = JSON.stringify(res.body);
    for (const hidden of ["Resposta esperada secreta", "Rubrica secreta", "Explicação secreta", "secreta */", "privado", "oculto", "isCorrect", "gradingStrategy", "expectedAnswer", "rubric", "explanation", "isTrickQuestion", "pendingReason"]) {
      expect(raw).not.toContain(hidden);
    }
  });

  it("012/FR-016 corpo de iniciar é estrito: campos desconhecidos → 400", async () => {
    const { activity } = await threeQuestions();
    const res = await client.post(`/api/me/activities/${activity.id}/attempt`, { studentUserId: student.id });
    expect([res.status, res.body.code]).toEqual([400, "VALIDATION_ERROR"]);
  });
});
