import type { Answer, StudentActivity, TeacherActivity, TeacherAttempt } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  acceptSubmission,
  applyExercises,
  completeAttempt,
  createClassWithStudents,
  getAttempt,
  gradeAttempt,
  releaseResult,
  retryAttempt,
  startAttempt,
} from "../helpers/activities";
import { FixedClock, HOUR } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 013/US3 — the teacher marks the open answers and the code of each student's first conclusion
 * right or wrong, with an optional comment, and may change the mark later (013/FR-016, FR-017,
 * research K7, K8): the points count at once, with no grade and no release; only scoring rows of
 * open answer or code are markable (`422 NOT_MARKABLE`), each change is audited with `from`/`to`, a
 * repeated mark is a no-op, and the grade routes of the 012 answer 409 for an EXERCISE.
 */

const START = "2026-10-01T12:00:00.000Z";
type Client = ReturnType<typeof api>;
type Item = { questionId: string; answer: Answer; baseRevision: number };
type Mark = { questionId: string; result: "CORRECT" | "WRONG"; comment?: string | null };

describe("013/US3 professor marca certo ou errado", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let students: TestUser[];
  let studentClients: Client[];
  let classId: string;
  /** Multiple choice (Intermediário, 30), open answer (Avançado, 60), code (Básico, 15), in this order. */
  let exerciseIds: string[];
  let activity: TeacherActivity;

  const base = (id = activity.id) => `/api/classes/${classId}/activities/${id}`;
  const markPath = (attemptId: string, id = activity.id) => `${base(id)}/attempts/${attemptId}/marks`;
  const mark = (attemptId: string, marks: Mark[], client = teacherClient, id = activity.id) => client.put(markPath(attemptId, id), { marks });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const question = (position: number, view: TeacherActivity = activity) => view.questions.find((q) => q.position === position)!;
  const detail = async () => (await teacherClient.get(base())).body as TeacherActivity;
  const rosterOf = async (student: TestUser) => (await detail()).roster.find((entry) => entry.studentUserId === student.id)!;
  const studentView = async (index: number) => (await studentClients[index]!.get(`/api/me/activities/${activity.id}`)).body as StudentActivity;
  /** Σ points of the student's scoring results in the class: what the ranking sums (013/FR-018). */
  const classPoints = async (student: TestUser) =>
    (await t.prisma.exerciseQuestionResult.aggregate({ where: { classId, studentUserId: student.id, scoring: true }, _sum: { points: true } }))._sum
      .points ?? 0;

  /** The correct alternative, an open text and a code, or nothing for `blank` questions (positions). */
  const answersFor = (view: StudentActivity, blank: number[] = []): Item[] =>
    view.questions
      .filter((q) => !blank.includes(q.position))
      .map((q): Item => {
        const answer: Answer =
          q.type === "MULTIPLE_CHOICE"
            ? { kind: "ALTERNATIVE", alternativeId: q.alternatives[0]!.id }
            : q.type === "CODE"
              ? { kind: "CODE", source: "class Resposta {}" }
              : { kind: "TEXT", text: "Herança reaproveita comportamento." };
        return { questionId: q.id, answer, baseRevision: 0 };
      });

  /** Starts and concludes attempt `number` of student `index`; answers the attempt's id. */
  const conclude = async (index: number, options: { number?: number; blank?: number[]; id?: string } = {}): Promise<string> => {
    const client = studentClients[index]!;
    const id = options.id ?? activity.id;
    const number = options.number ?? 1;
    const started = number === 1 ? await startAttempt(client, id) : await retryAttempt(client, id, number - 1);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const res = await completeAttempt(client, id, number, answersFor(started.body as StudentActivity, options.blank));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: id, studentUserId: students[index]!.id, number } });
    return row.id;
  };

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
    studentClients = [];
    for (const student of students) studentClients.push(api(t, { cookie: await loginAs(t, student) }));
    exerciseIds = [
      (await createExercise(t, teacher.id, { difficulty: "INTERMEDIATE" })).id,
      (await createExercise(t, teacher.id, { type: "OPEN_ANSWER", difficulty: "ADVANCED", expectedAnswer: "Reaproveitar código" })).id,
      (await createExercise(t, teacher.id, { type: "CODE", difficulty: "BASIC", expectedSolution: "class Esperada {}" })).id,
    ];
    const res = await applyExercises(teacherClient, classId, exerciseIds, { acknowledgeOutOfScope: true });
    expect(res.status).toBe(201);
    activity = res.body as TeacherActivity;
  });

  it("013/US3-1 013/FR-017 resposta Avançada marcada certa: 60 pontos na hora, Certo e o comentário para o aluno, sem liberação", async () => {
    const attemptId = await conclude(0);
    expect((await studentView(0)).points).toEqual({ possible: 105, earned: 30, awaitingCorrection: true });

    const res = await mark(attemptId, [{ questionId: question(1).id, result: "CORRECT", comment: "Muito bem explicado." }]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const body = res.body as TeacherAttempt;
    expect(body.submission).toBeNull();
    expect(body.exercise).toMatchObject({ number: 1, completedAt: START });
    expect(body.exercise!.results.find((row) => row.questionId === question(1).id)).toEqual({
      questionId: question(1).id,
      result: "CORRECT",
      points: 60,
      scoring: true,
      alreadyScored: false,
      nature: "HUMAN_DECISION",
      comment: "Muito bem explicado.",
      decidedAt: START,
    });

    // The student sees it at once: no release (013/FR-017, FR-023).
    const view = await studentView(0);
    expect(view.points).toEqual({ possible: 105, earned: 90, awaitingCorrection: true });
    const open = view.lastResult!.questions.find((q) => q.questionId === question(1).id)!;
    expect(open).toMatchObject({ result: "CORRECT", points: 60, teacherComment: "Muito bem explicado." });
    expect(view.lastResult!.pointsEarned).toBe(90);
    expect(await classPoints(students[0]!)).toBe(90);
    expect(await rosterOf(students[0]!)).toMatchObject({ status: "COMPLETED", attemptId, pointsEarned: 90, pendingMarks: 1 });
    expect((await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } })).resultReleasedAt).toBeNull();

    const [event] = await events("exercise_result.marked");
    expect(event).toMatchObject({ actorUserId: teacher.id, targetType: "ACTIVITY_ATTEMPT", targetId: attemptId });
    expect(event!.metadata).toEqual({ activityId: activity.id, questionId: question(1).id, from: "PENDING_TEACHER", to: "CORRECT", points: 60, hasComment: true });
    expect(JSON.stringify(event!.metadata)).not.toContain("Muito bem");
  });

  it("013/US3 teste independente: duas primeiras conclusões aguardando; uma certa e uma errada → pontos e situação dos dois", async () => {
    const first = await conclude(0);
    const second = await conclude(1);
    expect((await detail()).exerciseCounts).toEqual({ completed: 2, pendingMarks: 2 });

    expect((await mark(first, [{ questionId: question(1).id, result: "CORRECT" }, { questionId: question(2).id, result: "CORRECT" }])).status).toBe(200);
    expect((await mark(second, [{ questionId: question(1).id, result: "WRONG" }, { questionId: question(2).id, result: "WRONG", comment: "Faltou o método." }])).status).toBe(200);

    expect(await rosterOf(students[0]!)).toMatchObject({ status: "COMPLETED", pointsEarned: 105, pendingMarks: 0 });
    expect(await rosterOf(students[1]!)).toMatchObject({ status: "COMPLETED", pointsEarned: 30, pendingMarks: 0 });
    expect((await detail()).exerciseCounts).toEqual({ completed: 2, pendingMarks: 0 });
    expect([await classPoints(students[0]!), await classPoints(students[1]!)]).toEqual([105, 30]);
    expect((await studentView(0)).points).toEqual({ possible: 105, earned: 105, awaitingCorrection: false });
    expect((await studentView(1)).points).toEqual({ possible: 105, earned: 30, awaitingCorrection: false });
    const wrongCode = (await studentView(1)).lastResult!.questions.find((q) => q.questionId === question(2).id)!;
    expect(wrongCode).toMatchObject({ result: "WRONG", points: 0, teacherComment: "Faltou o método.", expectedSolution: "class Esperada {}" });
    expect(await events("exercise_result.marked")).toHaveLength(4);
  });

  it("013/US3-2 013/FR-017 mudar a marcação muda os pontos e é auditada; marca igual não gera evento", async () => {
    const attemptId = await conclude(0);
    const open = question(1).id;
    expect((await mark(attemptId, [{ questionId: open, result: "CORRECT" }])).status).toBe(200);
    expect(await classPoints(students[0]!)).toBe(90);

    clock.advance(HOUR);
    const changed = await mark(attemptId, [{ questionId: open, result: "WRONG", comment: "Revendo: incompleta." }]);
    expect(changed.status).toBe(200);
    expect((changed.body as TeacherAttempt).exercise!.results.find((row) => row.questionId === open)).toMatchObject({
      result: "WRONG",
      points: 0,
      nature: "HUMAN_DECISION",
      comment: "Revendo: incompleta.",
      decidedAt: clock.now().toISOString(),
    });
    expect(await classPoints(students[0]!)).toBe(30);
    expect((await studentView(0)).lastResult!.questions.find((q) => q.questionId === open)).toMatchObject({ result: "WRONG", teacherComment: "Revendo: incompleta." });

    // The same mark again: nothing changes and nothing is written.
    const same = await mark(attemptId, [{ questionId: open, result: "WRONG", comment: "Revendo: incompleta." }]);
    expect(same.status).toBe(200);
    // Without `comment` the stored comment stays.
    expect((await mark(attemptId, [{ questionId: open, result: "WRONG" }])).status).toBe(200);
    expect((await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId, questionId: open } })).comment).toBe("Revendo: incompleta.");

    // Only the comment changes: one event, the same result; `null` clears it.
    expect((await mark(attemptId, [{ questionId: open, result: "WRONG", comment: null }])).status).toBe(200);
    expect((await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId, questionId: open } })).comment).toBeNull();

    const marked = await events("exercise_result.marked");
    expect(marked.map((event) => event.metadata)).toEqual([
      { activityId: activity.id, questionId: open, from: "PENDING_TEACHER", to: "CORRECT", points: 60, hasComment: false },
      { activityId: activity.id, questionId: open, from: "CORRECT", to: "WRONG", points: 0, hasComment: true },
      { activityId: activity.id, questionId: open, from: "WRONG", to: "WRONG", points: 0, hasComment: false },
    ]);
  });

  it("013/US3-3 013/FR-016 respostas de refazer não entram na fila: a linha do aluno aponta a tentativa 1 e a 2 não é marcável", async () => {
    const firstId = await conclude(0);
    const secondId = await conclude(0, { number: 2 });
    expect(await rosterOf(students[0]!)).toMatchObject({ attemptId: firstId, pendingMarks: 2 });
    expect((await detail()).exerciseCounts).toEqual({ completed: 1, pendingMarks: 1 });

    const practice = await getAttempt(teacherClient, classId, activity.id, secondId);
    expect(practice.status).toBe(200);
    const results = (practice.body as TeacherAttempt).exercise!.results;
    expect(results.map((row) => [row.result, row.scoring, row.alreadyScored, row.points])).toEqual([
      ["CORRECT", false, false, 0],
      ["UNSCORED", false, false, 0],
      ["UNSCORED", false, false, 0],
    ]);
    const res = await mark(secondId, [{ questionId: question(1).id, result: "CORRECT" }]);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("NOT_MARKABLE");
    expect(await events("exercise_result.marked")).toHaveLength(0);
  });

  it("013/FR-017 NOT_MARKABLE: múltipla escolha, exercício em branco, tentativa aberta e já pontuado; tudo ou nada no pedido", async () => {
    const attemptId = await conclude(0, { blank: [2] });
    const refuse = async (attempt: string, marks: Mark[], id?: string) => {
      const res = await mark(attempt, marks, teacherClient, id);
      expect(res.status, JSON.stringify(marks)).toBe(422);
      expect(res.body.code).toBe("NOT_MARKABLE");
    };
    await refuse(attemptId, [{ questionId: question(0).id, result: "WRONG" }]);
    // The blank code is WRONG by the rule and never reaches the teacher (013/US2-3).
    await refuse(attemptId, [{ questionId: question(2).id, result: "CORRECT" }]);
    // A refused item refuses the whole request: the open answer stays pending.
    await refuse(attemptId, [
      { questionId: question(1).id, result: "CORRECT" },
      { questionId: question(0).id, result: "CORRECT" },
    ]);
    expect((await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId, questionId: question(1).id } })).result).toBe("PENDING_TEACHER");

    // An attempt still open has no result yet.
    expect((await startAttempt(studentClients[1]!, activity.id)).status).toBe(200);
    const open = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: students[1]!.id } });
    await refuse(open.id, [{ questionId: question(1).id, result: "CORRECT" }]);
    expect((await getAttempt(teacherClient, classId, activity.id, open.id)).body).toMatchObject({ status: "IN_PROGRESS", submission: null, exercise: null });

    // The same open exercise in a second activity of the class: already scored there (013/FR-010a).
    const again = await applyExercises(teacherClient, classId, [exerciseIds[1]!], { acknowledgeOutOfScope: true });
    expect(again.status).toBe(201);
    const other = again.body as TeacherActivity;
    const otherAttempt = await conclude(0, { id: other.id });
    const shown = (await getAttempt(teacherClient, classId, other.id, otherAttempt)).body as TeacherAttempt;
    expect(shown.exercise!.results).toEqual([
      expect.objectContaining({ result: "UNSCORED", scoring: false, alreadyScored: true, points: 0 }),
    ]);
    await refuse(otherAttempt, [{ questionId: other.questions[0]!.id, result: "CORRECT" }], other.id);

    // A question of another activity is not this attempt's.
    const unknown = await mark(attemptId, [{ questionId: other.questions[0]!.id, result: "CORRECT" }]);
    expect(unknown.status).toBe(422);
    expect(unknown.body.code).toBe("UNKNOWN_QUESTION");
    expect(await events("exercise_result.marked")).toHaveLength(0);
  });

  it("013/FR-017 só certo ou errado: resultado, pontos, nota ou campos a mais no corpo → 400", async () => {
    const attemptId = await conclude(0);
    const open = question(1).id;
    for (const body of [
      { marks: [] },
      { marks: [{ questionId: open, result: "PENDING_TEACHER" }] },
      { marks: [{ questionId: open, result: "UNSCORED" }] },
      { marks: [{ questionId: open, result: "CORRECT", points: 60 }] },
      { marks: [{ questionId: open, result: "CORRECT", grade: "10.00" }] },
      { marks: [{ questionId: open, result: "CORRECT" }], first: true },
      { marks: [{ questionId: open, result: "CORRECT" }, { questionId: open, result: "WRONG" }] },
      { marks: [{ questionId: open, result: "CORRECT", comment: "x".repeat(2_001) }] },
    ]) {
      const res = await teacherClient.put(markPath(attemptId), body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId, questionId: open } })).result).toBe("PENDING_TEACHER");
  });

  it("013/US3-4 professor de outra turma → 404; aluno → 403; tentativa de outra atividade → 404", async () => {
    const attemptId = await conclude(0);
    const marks: Mark[] = [{ questionId: question(1).id, result: "CORRECT" }];

    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherClient = api(t, { cookie: await loginAs(t, other) });
    const foreign = await mark(attemptId, marks, otherClient);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("NOT_FOUND");

    const byStudent = await mark(attemptId, marks, studentClients[0]!);
    expect(byStudent.status).toBe(403);

    const second = await applyExercises(teacherClient, classId, [exerciseIds[0]!], { acknowledgeOutOfScope: true });
    const wrongActivity = await mark(attemptId, marks, teacherClient, (second.body as TeacherActivity).id);
    expect(wrongActivity.status).toBe(404);
    expect((await mark(crypto.randomUUID(), marks)).status).toBe(404);
    expect(await classPoints(students[0]!)).toBe(30);
  });

  it("013/US3-5 013/FR-016 a tentativa para o professor: resultados por exercício, sem nota; nota, aceitar entrega e liberar → 409", async () => {
    const attemptId = await conclude(0);
    const res = await getAttempt(teacherClient, classId, activity.id, attemptId);
    expect(res.status).toBe(200);
    const attempt = res.body as TeacherAttempt;
    expect(attempt).toMatchObject({ id: attemptId, status: "SUBMITTED", submission: null });
    expect(attempt.answers).toHaveLength(3);
    expect(attempt.exercise).toEqual({
      number: 1,
      completedAt: START,
      results: [
        { questionId: question(0).id, result: "CORRECT", points: 30, scoring: true, alreadyScored: false, nature: "RULE_RESULT", comment: null, decidedAt: null },
        { questionId: question(1).id, result: "PENDING_TEACHER", points: 0, scoring: true, alreadyScored: false, nature: null, comment: null, decidedAt: null },
        { questionId: question(2).id, result: "PENDING_TEACHER", points: 0, scoring: true, alreadyScored: false, nature: null, comment: null, decidedAt: null },
      ],
    });
    expect(JSON.stringify(attempt)).not.toMatch(/"grade"|gradePartial|finalGrade/);

    const graded = await gradeAttempt(teacherClient, classId, activity.id, attemptId, { version: 1, decisions: [{ questionId: question(1).id, grade: "1.00" }] });
    expect([graded.status, graded.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
    const accepted = await acceptSubmission(teacherClient, classId, activity.id, attemptId);
    expect([accepted.status, accepted.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
    const released = await releaseResult(teacherClient, classId, activity.id);
    expect([released.status, released.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
  });

  it("013/FR-017 atividade cancelada → 409 e nada muda; encerrada → a marcação continua permitida", async () => {
    const first = await conclude(0);
    const second = await conclude(1);
    const marks: Mark[] = [{ questionId: question(1).id, result: "CORRECT" }];

    expect((await teacherClient.post(`${base()}/close`, {})).status).toBe(200);
    expect((await mark(first, marks)).status).toBe(200);
    expect(await classPoints(students[0]!)).toBe(90);

    expect((await teacherClient.post(`${base()}/cancel`, {})).status).toBe(200);
    const res = await mark(second, marks);
    expect([res.status, res.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
    expect((await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId: second, questionId: question(1).id } })).result).toBe("PENDING_TEACHER");
    expect(await events("exercise_result.marked")).toHaveLength(1);
  });
});
