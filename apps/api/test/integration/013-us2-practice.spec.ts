import type { Answer, StudentActivity, StudentExerciseAttempt, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyExercises,
  applyWork,
  completeAttempt,
  createClassWithStudents,
  getExerciseAttempt,
  retryAttempt,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "../helpers/activities";
import { DAY, FixedClock, HOUR } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork } from "../helpers/works";

/**
 * 013/US2 — the student practices an EXERCISE activity: numbered attempts (one open at a time),
 * "Concluir exercícios" once per attempt, a result per exercise with the answer key after each
 * conclusion, points only from attempt 1 and once per bank exercise in the class (013/FR-005…FR-015,
 * FR-010a; research K3–K10). No grade, deadline or late policy anywhere; the server clock decides.
 */

const START = "2026-10-01T12:00:00.000Z";
type Client = ReturnType<typeof api>;
type Item = { questionId: string; answer: Answer; baseRevision: number };

describe("013/US2 aluno pratica, conclui e vê gabarito e pontos", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let students: TestUser[];
  let student: Client;
  let classId: string;
  /** Multiple choice (Intermediário, 30), open answer (Básico, 15), code (Avançado, 60), in this order. */
  let exerciseIds: string[];
  let activityId: string;

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const results = () => t.prisma.exerciseQuestionResult.findMany({ orderBy: [{ attemptId: "asc" }, { questionId: "asc" }] });

  /** The answers of `view`'s questions: the correct alternative (position 0) or `wrong`, a text and a code. */
  const answersFor = (view: StudentActivity, options: { wrong?: boolean; blank?: boolean } = {}): Item[] =>
    view.questions.flatMap((question): Item[] => {
      if (options.blank) return [];
      const answer: Answer =
        question.type === "MULTIPLE_CHOICE"
          ? { kind: "ALTERNATIVE", alternativeId: question.alternatives[options.wrong ? 1 : 0]!.id }
          : question.type === "CODE"
            ? { kind: "CODE", source: "class Resposta {}" }
            : { kind: "TEXT", text: "Herança reaproveita comportamento." };
      return [{ questionId: question.id, answer, baseRevision: 0 }];
    });

  const apply = async (ids = exerciseIds) => {
    const res = await applyExercises(teacherClient, classId, ids, { acknowledgeOutOfScope: true });
    expect(res.status).toBe(201);
    return res.body as TeacherActivity;
  };
  const start = async (client = student, id = activityId) => {
    const res = await startAttempt(client, id);
    expect(res.status).toBe(200);
    return res.body as StudentActivity;
  };
  /** Starts (or reuses the open attempt) and concludes it with the given answers. */
  const conclude = async (number: number, items: Item[], client = student, id = activityId) => {
    const res = await completeAttempt(client, id, number, items);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentActivity;
  };
  const byPosition = (attempt: StudentExerciseAttempt) => [...attempt.questions].sort((a, b) => a.position - b.position);

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createClassWithStudents(t, teacher.id, { students: 2 });
    classId = created.schoolClass.id;
    students = created.students;
    student = api(t, { cookie: await loginAs(t, students[0]!) });
    exerciseIds = [
      (await createExercise(t, teacher.id, { difficulty: "INTERMEDIATE", explanation: "Explicação da múltipla escolha" })).id,
      (await createExercise(t, teacher.id, { type: "OPEN_ANSWER", difficulty: "BASIC", expectedAnswer: "Reaproveitar código" })).id,
      (await createExercise(t, teacher.id, { type: "CODE", difficulty: "ADVANCED", expectedSolution: "class Esperada {}" })).id,
    ];
    activityId = (await apply()).id;
  });

  it("013/US2-1 013/FR-011 013/FR-013 antes de concluir: sem prazo, tempo, nota, gabarito nem resultado", async () => {
    const listed = (await student.get("/api/me/activities")).body.items[0];
    expect(listed).toMatchObject({ id: activityId, status: "PENDING", deadline: null, latePolicy: null, totalGrade: null, urgent: false, late: false });

    const view = await start();
    expect(view).toMatchObject({ status: "IN_PROGRESS", deadline: null, latePolicy: null, totalGrade: null, submission: null, result: null, lastResult: null });
    expect(view.attempt?.number).toBe(1);
    expect(view.points).toEqual({ possible: 105, earned: 0, awaitingCorrection: false });
    expect(view.questions.map((question) => [question.value, question.points])).toEqual([
      [null, 30],
      [null, 15],
      [null, 60],
    ]);
    const raw = JSON.stringify(view);
    for (const forbidden of ["isCorrect", "expectedAnswer", "expectedSolution", "explanation", "Reaproveitar código", "class Esperada", "Explicação da múltipla"]) {
      expect(raw, forbidden).not.toContain(forbidden);
    }
    // A concluded attempt that doesn't exist yet is 404.
    expect((await getExerciseAttempt(student, activityId, 1)).status).toBe(404);
  });

  it("013/US2-2 013/US2-4 013/FR-009 013/FR-012 primeira conclusão: múltipla escolha certa vale 30; aberta e código aguardam o professor com o gabarito", async () => {
    const view = await start();
    const concluded = await conclude(1, answersFor(view));
    expect(concluded).toMatchObject({ status: "COMPLETED", attempt: null, points: { possible: 105, earned: 30, awaitingCorrection: true } });
    expect(concluded.completedAttempts).toEqual([{ number: 1, completedAt: START }]);

    const last = concluded.lastResult!;
    expect(last).toMatchObject({ number: 1, completedAt: START, first: true, pointsEarned: 30 });
    const [choice, open, code] = byPosition(last);
    const correctId = view.questions[0]!.alternatives[0]!.id;
    expect(choice).toMatchObject({
      result: "CORRECT",
      points: 30,
      alreadyScored: false,
      answer: { kind: "ALTERNATIVE", alternativeId: correctId },
      correctAlternativeId: correctId,
      expectedAnswer: null,
      expectedSolution: null,
      explanation: "Explicação da múltipla escolha",
      teacherComment: null,
    });
    expect(open).toMatchObject({ result: "PENDING_TEACHER", points: 0, expectedAnswer: "Reaproveitar código", correctAlternativeId: null, expectedSolution: null });
    expect(code).toMatchObject({ result: "PENDING_TEACHER", points: 0, expectedSolution: "class Esperada {}", expectedAnswer: null });

    // The same view by number.
    expect((await getExerciseAttempt(student, activityId, 1)).body).toEqual(last);

    const [event] = await events("exercise_attempt.completed");
    expect(event).toMatchObject({ actorUserId: students[0]!.id, targetType: "ACTIVITY_ATTEMPT" });
    expect(event!.metadata).toEqual({
      activityId,
      classId,
      attemptNumber: 1,
      first: true,
      questionCount: 3,
      blankCount: 0,
      correctCount: 1,
      pendingCount: 2,
      alreadyScoredCount: 0,
      points: 30,
    });
    // Conclusion is not submission: no submission or grading row (research K5).
    expect(await t.prisma.activitySubmission.count()).toBe(0);
    expect(await t.prisma.activityQuestionGrading.count()).toBe(0);
  });

  it("013/US2-3 013/FR-010 múltipla escolha errada e exercícios em branco: Errado, 0 ponto, gabarito e nada na fila do professor", async () => {
    const view = await start();
    const choiceOnly = answersFor(view, { wrong: true }).slice(0, 1);
    const concluded = await conclude(1, choiceOnly);
    expect(concluded.points).toEqual({ possible: 105, earned: 0, awaitingCorrection: false });
    const [choice, open, code] = byPosition(concluded.lastResult!);
    expect(choice).toMatchObject({ result: "WRONG", points: 0, correctAlternativeId: view.questions[0]!.alternatives[0]!.id });
    expect(open).toMatchObject({ result: "WRONG", points: 0, answer: null, expectedAnswer: "Reaproveitar código" });
    expect(code).toMatchObject({ result: "WRONG", points: 0, answer: null, expectedSolution: "class Esperada {}" });
    expect((await results()).filter((row) => row.result === "PENDING_TEACHER")).toEqual([]);
    expect((await events("exercise_attempt.completed"))[0]!.metadata).toMatchObject({ blankCount: 2, correctCount: 0, pendingCount: 0, points: 0 });
  });

  it("013/US2-8 013/FR-007 a regra de branco da 012: código igual ao inicial e texto só com espaços contam como em branco", async () => {
    const view = await start();
    const blanks: Item[] = [
      { questionId: view.questions[1]!.id, answer: { kind: "TEXT", text: "   " }, baseRevision: 0 },
      { questionId: view.questions[2]!.id, answer: { kind: "CODE", source: "" }, baseRevision: 0 },
    ];
    const concluded = await conclude(1, blanks);
    expect(byPosition(concluded.lastResult!).map((question) => question.result)).toEqual(["WRONG", "WRONG", "WRONG"]);
    expect((await events("exercise_attempt.completed"))[0]!.metadata).toMatchObject({ blankCount: 3, questionCount: 3 });
  });

  it("013/US2-5 013/FR-005 013/FR-008 refazer: tentativa nova em branco; certo/errado e gabarito sem pontos, e os pontos ficam os da primeira", async () => {
    const view = await start();
    await conclude(1, answersFor(view, { wrong: true }));

    const retried = await retryAttempt(student, activityId, 1);
    expect(retried.status).toBe(200);
    expect(retried.body).toMatchObject({ status: "COMPLETED", attempt: { number: 2, answers: [] } });
    const [started] = (await events("activity_attempt.started")).slice(-1);
    expect(started!.metadata).toMatchObject({ activityId, classId, attemptNumber: 2 });

    // Saving works on attempt 2, as in 012 (013/FR-006).
    const saved = await saveAnswers(student, activityId, answersFor(view).slice(0, 1));
    expect(saved.body.results[0].outcome).toBe("SAVED");

    const second = await conclude(2, answersFor(view).slice(1));
    expect(second.points).toEqual({ possible: 105, earned: 0, awaitingCorrection: true });
    expect(second.lastResult).toMatchObject({ number: 2, first: false, pointsEarned: 0 });
    const [choice, open, code] = byPosition(second.lastResult!);
    expect(choice).toMatchObject({ result: "CORRECT", points: 0, alreadyScored: false });
    expect(open).toMatchObject({ result: "UNSCORED", points: 0, expectedAnswer: "Reaproveitar código" });
    expect(code).toMatchObject({ result: "UNSCORED", points: 0 });
    expect(second.completedAttempts.map((attempt) => attempt.number)).toEqual([2, 1]);

    // Attempt 1 keeps its view; practice never enters the teacher's queue.
    expect((await getExerciseAttempt(student, activityId, 1)).body).toMatchObject({ first: true, pointsEarned: 0 });
    const practiceRows = (await results()).filter((row) => !row.scoring);
    expect(practiceRows).toHaveLength(3);
    expect(practiceRows.some((row) => row.result === "PENDING_TEACHER")).toBe(false);
    expect((await events("exercise_attempt.completed"))[1]!.metadata).toMatchObject({ attemptNumber: 2, first: false, points: 0, pendingCount: 0 });
  });

  it("013/FR-005 uma tentativa aberta por vez: refazer com a aberta, de outra tentativa ou repetido", async () => {
    const view = await start();
    const early = await retryAttempt(student, activityId, 1);
    expect([early.status, early.body.code]).toEqual([409, "ATTEMPT_NOT_COMPLETED"]);
    await conclude(1, answersFor(view));

    expect((await retryAttempt(student, activityId, 1)).body.attempt.number).toBe(2);
    // A repeat of the same "Refazer" returns attempt 2, with no new event.
    const repeated = await retryAttempt(student, activityId, 1);
    expect([repeated.status, repeated.body.attempt.number]).toEqual([200, 2]);
    expect((await events("activity_attempt.started")).map((event) => (event.metadata as { attemptNumber: number }).attemptNumber)).toEqual([1, 2]);

    await conclude(2, []);
    const stale = await retryAttempt(student, activityId, 1);
    expect([stale.status, stale.body.code]).toEqual([409, "NOT_LATEST_ATTEMPT"]);
    expect((await retryAttempt(student, activityId, 2)).body.attempt.number).toBe(3);
    // Starting again never opens another attempt.
    expect((await startAttempt(student, activityId)).body.attempt.number).toBe(3);
    expect(await t.prisma.activityAttempt.count({ where: { status: "IN_PROGRESS" } })).toBe(1);
    expect((await events("activity_submission.rejected")).map((event) => event.metadata)).toEqual([
      { operation: "RETRY", code: "ATTEMPT_NOT_COMPLETED" },
      { operation: "RETRY", code: "NOT_LATEST_ATTEMPT" },
    ]);
    expect((await retryAttempt(student, activityId, 0)).status).toBe(400);
  });

  it("013/US2-6 013/FR-007 concluir duas vezes (clique duplo, reenvio): uma conclusão, uma pontuação, um evento", async () => {
    const view = await start();
    const items = answersFor(view);
    const [a, b] = await Promise.all([completeAttempt(student, activityId, 1, items), completeAttempt(student, activityId, 1, items)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const again = await conclude(1, items);
    expect(again.lastResult).toEqual(a.body.lastResult);
    expect(await events("exercise_attempt.completed")).toHaveLength(1);
    expect((await results()).filter((row) => row.scoring)).toHaveLength(3);
    expect(again.points?.earned).toBe(30);
  });

  it("013/US2-7 013/FR-008 duas abas concluem ao mesmo tempo com respostas diferentes: só uma é a primeira conclusão", async () => {
    const view = await start();
    const [right, wrong] = await Promise.all([
      completeAttempt(student, activityId, 1, answersFor(view)),
      completeAttempt(student, activityId, 1, answersFor(view, { wrong: true })),
    ]);
    const statuses = [right.status, wrong.status].sort();
    // The loser either sees the same conclusion (200) or its stale answer refused (409).
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    expect(await events("exercise_attempt.completed")).toHaveLength(1);
    expect(await t.prisma.activityAttempt.count()).toBe(1);
    expect((await results()).filter((row) => row.scoring)).toHaveLength(3);
  });

  it("013/US2-9 013/FR-010a o mesmo exercício do banco pontua uma vez por turma: na outra atividade aparece já pontuado", async () => {
    const view = await start();
    await conclude(1, answersFor(view));
    const another = (await createExercise(t, teacher.id, { difficulty: "BASIC" })).id;
    const second = await apply([exerciseIds[0]!, exerciseIds[1]!, another]);

    const otherView = await start(student, second.id);
    const concluded = await conclude(1, answersFor(otherView), student, second.id);
    const [choice, open, fresh] = byPosition(concluded.lastResult!);
    expect(choice).toMatchObject({ result: "CORRECT", points: 0, alreadyScored: true, correctAlternativeId: otherView.questions[0]!.alternatives[0]!.id });
    // Already scored: practice, never the teacher's queue ("Compare com o gabarito").
    expect(open).toMatchObject({ result: "UNSCORED", points: 0, alreadyScored: true, expectedAnswer: "Reaproveitar código" });
    expect(fresh).toMatchObject({ result: "CORRECT", points: 15, alreadyScored: false });
    expect(concluded.lastResult).toMatchObject({ first: true, pointsEarned: 15 });
    expect(concluded.points).toEqual({ possible: 60, earned: 15, awaitingCorrection: false });
    expect((await events("exercise_attempt.completed"))[1]!.metadata).toMatchObject({ alreadyScoredCount: 2, correctCount: 2, pendingCount: 0, points: 15 });

    // Another student of the class scores it normally: the slot is per student.
    const other = api(t, { cookie: await loginAs(t, students[1]!) });
    const otherConcluded = await conclude(1, answersFor(await start(other, second.id)), other, second.id);
    expect(otherConcluded.points?.earned).toBe(45);
  });

  it("013/FR-010a cancelar a atividade que pontuou: os pontos não migram para outra atividade com o mesmo exercício", async () => {
    const view = await start();
    await conclude(1, answersFor(view));
    expect((await teacherClient.post(`/api/classes/${classId}/activities/${activityId}/cancel`, {})).status).toBe(200);
    // The cancelled activity leaves the student's views.
    expect((await student.get(`/api/me/activities/${activityId}`)).status).toBe(404);
    expect((await getExerciseAttempt(student, activityId, 1)).status).toBe(404);

    const second = await apply([exerciseIds[0]!]);
    const concluded = await conclude(1, answersFor(await start(student, second.id)), student, second.id);
    expect(byPosition(concluded.lastResult!)[0]).toMatchObject({ result: "CORRECT", points: 0, alreadyScored: true });
    expect((await results()).filter((row) => row.scoring).every((row) => row.activityId === activityId)).toBe(true);
  });

  it("013/FR-014 situação derivada: Pendente, Em andamento, Concluída com pontos aguardando correção; nunca atrasada", async () => {
    const status = async () => (await student.get(`/api/me/activities/${activityId}`)).body as StudentActivity;
    expect((await status()).status).toBe("PENDING");
    const view = await start();
    expect((await status()).status).toBe("IN_PROGRESS");
    clock.advance(400 * DAY);
    expect(await status()).toMatchObject({ status: "IN_PROGRESS", canAnswer: true, urgent: false, late: false });
    await conclude(1, answersFor(view));
    expect(await status()).toMatchObject({ status: "COMPLETED", canAnswer: true, points: { awaitingCorrection: true } });
    await retryAttempt(student, activityId, 1);
    // A retry open keeps the activity concluded (any conclusion → COMPLETED).
    expect(await status()).toMatchObject({ status: "COMPLETED", attempt: { number: 2 } });

    // The teacher's roster follows attempt 1.
    const roster = ((await teacherClient.get(`/api/classes/${classId}/activities/${activityId}`)).body as TeacherActivity).roster;
    expect(roster.find((entry) => entry.studentUserId === students[0]!.id)).toMatchObject({ status: "COMPLETED", pointsEarned: 30, pendingMarks: 2 });
    expect(roster.find((entry) => entry.studentUserId === students[1]!.id)).toMatchObject({ status: "NOT_STARTED", pointsEarned: 0 });
  });

  it("013/FR-015 painel e Minhas atividades: exercícios nos contadores e depois das atividades com prazo, dos mais recentes aos mais antigos", async () => {
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const withSubject = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 0 });
    await createEnrollment(t, withSubject.schoolClass.id, students[0]!.id);
    const work = await createWork(t, teacher.id, { syllabus, status: "APPROVED", totalGrade: "1.00" });
    const assignment = await applyWork(teacherClient, withSubject.schoolClass.id, work.id, {
      acknowledgeOutOfScope: true,
      deadline: new Date(clock.now().getTime() + 3 * DAY).toISOString(),
    });
    expect(assignment.status).toBe(201);
    clock.advance(HOUR);
    const newer = await apply([exerciseIds[0]!]);

    const dashboard = (await student.get("/api/me/dashboard")).body;
    expect(dashboard.next.map((item: { id: string }) => item.id)).toEqual([assignment.body.id, newer.id, activityId]);
    expect(dashboard.counts).toEqual({ pending: 3, inProgress: 0, overdue: 0, completed: 0 });

    await conclude(1, answersFor(await start()));
    const after = (await student.get("/api/me/dashboard")).body;
    expect(after.counts).toEqual({ pending: 2, inProgress: 0, overdue: 0, completed: 1 });
    const completed = (await student.get("/api/me/activities?status=COMPLETED")).body.items;
    expect(completed).toEqual([expect.objectContaining({ id: activityId, status: "COMPLETED", points: { possible: 105, earned: 30, awaitingCorrection: true } })]);
    expect((await student.get("/api/me/activities?type=EXERCISE")).body.items.map((item: { id: string }) => item.id)).toEqual([newer.id, activityId]);
  });

  it("013/FR-012 a tentativa por número: só concluída e só do próprio aluno", async () => {
    const view = await start();
    await conclude(1, answersFor(view));
    await retryAttempt(student, activityId, 1);
    expect((await getExerciseAttempt(student, activityId, 2)).status).toBe(404);
    expect((await getExerciseAttempt(student, activityId, 9)).status).toBe(404);
    expect((await getExerciseAttempt(student, activityId, 0)).status).toBe(400);
    // The other student of the class has no attempt 1: 404, never the first student's.
    const other = api(t, { cookie: await loginAs(t, students[1]!) });
    expect((await getExerciseAttempt(other, activityId, 1)).status).toBe(404);
  });

  it("013/FR-007 a entrega da 012 não existe para Exercício: submit → 409; concluir sem iniciar → 409 NOT_STARTED", async () => {
    const notStarted = await completeAttempt(student, activityId, 1);
    expect([notStarted.status, notStarted.body.code]).toEqual([409, "NOT_STARTED"]);
    await start();
    const submitted = await submitAttempt(student, activityId);
    expect([submitted.status, submitted.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
    const wrongNumber = await completeAttempt(student, activityId, 2);
    expect([wrongNumber.status, wrongNumber.body.code]).toEqual([409, "NOT_STARTED"]);
    expect(await t.prisma.activitySubmission.count()).toBe(0);
  });

  it("013/FR-007 uma resposta pendente com revisão antiga aborta a conclusão (409 ANSWER_CHANGED_ELSEWHERE), sem concluir", async () => {
    const view = await start();
    await saveAnswers(student, activityId, answersFor(view).slice(1, 2));
    const stale = [{ ...answersFor(view)[1]!, answer: { kind: "TEXT" as const, text: "Outra aba" }, baseRevision: 0 }];
    const refused = await completeAttempt(student, activityId, 1, stale);
    expect([refused.status, refused.body.code]).toEqual([409, "ANSWER_CHANGED_ELSEWHERE"]);
    expect(await events("exercise_attempt.completed")).toHaveLength(0);
    expect((await student.get(`/api/me/activities/${activityId}`)).body.status).toBe("IN_PROGRESS");
  });

  describe("013/US2 casos de borda", () => {
    it("013/FR-004 atividade encerrada: iniciar, refazer e concluir → 409 ACTIVITY_CLOSED; os pontos ganhos continuam", async () => {
      const view = await start();
      await conclude(1, answersFor(view));
      const other = api(t, { cookie: await loginAs(t, students[1]!) });
      await start(other);
      expect((await teacherClient.post(`/api/classes/${classId}/activities/${activityId}/close`, {})).status).toBe(200);

      expect((await retryAttempt(student, activityId, 1)).body.code).toBe("ACTIVITY_CLOSED");
      expect((await completeAttempt(other, activityId, 1)).body.code).toBe("ACTIVITY_CLOSED");
      const third = api(t, { cookie: await loginAs(t, (await createClassWithStudents(t, teacher.id)).students[0]!) });
      expect((await startAttempt(third, activityId)).status).toBe(404);
      const mine = (await student.get(`/api/me/activities/${activityId}`)).body as StudentActivity;
      expect(mine).toMatchObject({ status: "COMPLETED", canAnswer: false, points: { earned: 30, awaitingCorrection: true } });
      expect(mine.lastResult?.pointsEarned).toBe(30);
    });

    it("013/FR-005 matrícula removida com tentativa aberta: 404 e nada pontua", async () => {
      const view = await start();
      await t.prisma.enrollment.updateMany({ where: { classId, studentUserId: students[0]!.id }, data: { status: "REMOVED", removedAt: new Date() } });
      expect((await completeAttempt(student, activityId, 1, answersFor(view))).status).toBe(404);
      expect((await getExerciseAttempt(student, activityId, 1)).status).toBe(404);
      expect(await results()).toEqual([]);
      const [denied] = (await events("student_access.denied")).slice(-1);
      expect(denied!.metadata).toEqual({ route: "/me/activities/:activityId/attempts/:number", reason: "NOT_ENROLLED" });
    });

    it("013/FR-014 aluno matriculado depois da publicação pratica normalmente", async () => {
      const late = await createUser(t, { roles: ["STUDENT"] });
      clock.advance(10 * DAY);
      await createEnrollment(t, classId, late.id);
      const client = api(t, { cookie: await loginAs(t, late) });
      const concluded = await conclude(1, answersFor(await start(client)), client);
      expect(concluded.points?.earned).toBe(30);
    });

    it("013/FR-014 turma INACTIVE ou ARCHIVED: só leitura (CLASS_NOT_ACTIVE), o resultado continua visível", async () => {
      const view = await start();
      await conclude(1, answersFor(view));
      for (const status of ["INACTIVE", "ARCHIVED"] as const) {
        await t.prisma.schoolClass.update({ where: { id: classId }, data: { status } });
        const retry = await retryAttempt(student, activityId, 1);
        expect([retry.status, retry.body.code], status).toEqual([409, "CLASS_NOT_ACTIVE"]);
        const read = (await student.get(`/api/me/activities/${activityId}`)).body as StudentActivity;
        expect(read).toMatchObject({ status: "COMPLETED", canAnswer: false });
        expect((await getExerciseAttempt(student, activityId, 1)).status).toBe(200);
      }
    });
  });
});
