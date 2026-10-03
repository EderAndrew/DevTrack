import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ExerciseResult } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 013 data-model.md, research K1–K7: the database refuses, by itself, what the exercise-points rules
 * forbid — rows written by Prisma or SQL, without the API or its contracts in the way (constitution V).
 */
describe("013/FR-001 013/FR-005 013/FR-008 013/FR-010 013/FR-010a regras dos pontos garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let classId: string;
  let student: TestUser;
  let other: TestUser;
  /** EXERCISE: multiple choice BASIC (15), open answer INTERMEDIATE (30), code ADVANCED (60). */
  let exercise: CreatedActivity;
  let assignment: CreatedActivity;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    const { schoolClass, students } = await createClassWithStudents(t, teacherId, { students: 2 });
    classId = schoolClass.id;
    [student, other] = students as [TestUser, TestUser];
    exercise = await createActivity(t, schoolClass, {
      type: "EXERCISE",
      questions: [
        { type: "MULTIPLE_CHOICE", difficulty: "BASIC" },
        { type: "OPEN_ANSWER", difficulty: "INTERMEDIATE" },
        { type: "CODE", difficulty: "ADVANCED" },
      ],
    });
    assignment = await createActivity(t, schoolClass);
  });

  const [MC, OPEN, CODE] = [0, 1, 2];
  const POINTS = [15, 30, 60];
  const exerciseId = () => exercise.activity.id;
  const sourceOf = async (question: number) =>
    (await t.prisma.classActivityQuestion.findUniqueOrThrow({ where: { id: exercise.questionIds[question]! } })).sourceExerciseId!;

  /** An attempt of the EXERCISE: concluded (with `completedAt`) or open. */
  const attempt = (number: number, concluded: boolean, who = student, activityId = exerciseId()) =>
    createAttemptRow(t, activityId, who.id, { number, ...(concluded ? { completedAt: new Date() } : {}) }).then((row) => row.attemptId);

  /** A result row of `question` in `attemptId`; the fields of a valid scoring MC "Certo" unless overridden. */
  const result = async (
    attemptId: string,
    question: number,
    fields: { scoring?: boolean; result?: ExerciseResult; points?: number; nature?: "RULE_RESULT" | "HUMAN_DECISION" | null; questionPoints?: number; classId?: string } = {},
    who = student,
    activity = exercise,
  ) =>
    t.prisma.exerciseQuestionResult.create({
      data: {
        attemptId,
        questionId: activity.questionIds[question]!,
        activityId: activity.activity.id,
        questionPoints: fields.questionPoints ?? POINTS[question]!,
        classId: fields.classId ?? classId,
        studentUserId: who.id,
        sourceExerciseId: (await t.prisma.classActivityQuestion.findUniqueOrThrow({ where: { id: activity.questionIds[question]! } })).sourceExerciseId!,
        scoring: fields.scoring ?? true,
        result: fields.result ?? "CORRECT",
        points: fields.points ?? ((fields.scoring ?? true) && (fields.result ?? "CORRECT") === "CORRECT" ? POINTS[question]! : 0),
        nature: fields.nature === undefined ? "RULE_RESULT" : fields.nature,
      },
    });

  describe("atividade e snapshot (research K1, K2)", () => {
    it("013/FR-001 Exercício sem nota, prazo, regra nem liberação; Trabalho com todos eles", async () => {
      const id = exerciseId();
      for (const data of [
        { totalGrade: "1.00" },
        { deadline: new Date(Date.now() + 86_400_000) },
        { latePolicy: "REJECT" as const },
        { resultReleasedAt: new Date(), resultReleasedById: teacherId },
      ]) {
        await expect(t.prisma.classActivity.update({ where: { id }, data }), JSON.stringify(Object.keys(data))).rejects.toThrow(/type_fields_chk|immutable/);
      }
      await expect(t.prisma.classActivity.update({ where: { id: assignment.activity.id }, data: { deadline: null } })).rejects.toThrow(/type_fields_chk/);
      await expect(t.prisma.classActivity.update({ where: { id: assignment.activity.id }, data: { latePolicy: null } })).rejects.toThrow(/type_fields_chk/);
      const stored = await t.prisma.classActivity.findUniqueOrThrow({ where: { id } });
      expect([stored.totalGrade, stored.deadline, stored.latePolicy, stored.resultReleasedAt]).toEqual([null, null, null, null]);
    });

    it("013/FR-002 nível e pontos andam juntos: 15/30/60, ou nenhum dos dois", async () => {
      const rows = await t.prisma.classActivityQuestion.findMany({ where: { activityId: exerciseId() }, orderBy: { position: "asc" } });
      expect(rows.map((row) => [row.difficulty, row.points, row.value])).toEqual([
        ["BASIC", 15, null],
        ["INTERMEDIATE", 30, null],
        ["ADVANCED", 60, null],
      ]);
      const insert = (difficulty: string | null, points: number | null) =>
        t.prisma.$executeRawUnsafe(
          `INSERT INTO "class_activity_questions" ("activity_id", "position", "type", "grading_strategy", "statement", "expected_answer", "difficulty", "points")
           VALUES ($1::uuid, 9, 'OPEN_ANSWER', 'AI_REVIEW', 'x', 'y', $2::exercise_difficulty, $3)`,
          exerciseId(),
          difficulty,
          points,
        );
      for (const [difficulty, points] of [["BASIC", 30], ["ADVANCED", 15], ["INTERMEDIATE", null], [null, 60]] as const) {
        await expect(insert(difficulty, points), `${difficulty}/${points}`).rejects.toThrow(/points_chk/);
      }
    });

    it("questão de Exercício precisa do exercício, nível e pontos e não tem valor; questão de Trabalho é o contrário (no commit)", async () => {
      const exerciseRow = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: exerciseId() } });
      const writeExercise = (question: Record<string, unknown>) =>
        t.prisma.$transaction(async (tx) => {
          const activity = await tx.classActivity.create({
            data: { classId, teacherId, type: "EXERCISE", title: "x", questionCount: 1, publishAt: exerciseRow.publishAt, idempotencyKey: randomUUID() },
          });
          await tx.classActivityQuestion.create({
            data: { activityId: activity.id, position: 0, type: "OPEN_ANSWER", gradingStrategy: "AI_REVIEW", statement: "x", expectedAnswer: "y", ...question },
          });
        });
      const source = await sourceOf(OPEN);
      await expect(writeExercise({ difficulty: "BASIC", points: 15, sourceExerciseId: source })).resolves.toBeUndefined();
      await expect(writeExercise({ difficulty: "BASIC", points: 15, sourceExerciseId: source, value: "1.00" })).rejects.toThrow(/need an exercise/);
      await expect(writeExercise({ difficulty: "BASIC", points: 15 })).rejects.toThrow(/need an exercise/);
      await expect(writeExercise({ sourceExerciseId: source })).rejects.toThrow(/need an exercise/);

      const work = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: assignment.activity.id } });
      const writeAssignment = (question: Record<string, unknown>) =>
        t.prisma.$transaction(async (tx) => {
          const activity = await tx.classActivity.create({
            data: {
              classId,
              teacherId,
              type: "ASSIGNMENT",
              title: "x",
              totalGrade: "1.00",
              questionCount: 1,
              publishAt: work.publishAt,
              deadline: work.deadline,
              latePolicy: "REJECT",
              sourceWorkId: work.sourceWorkId,
              sourceSubjectId: work.sourceSubjectId,
              idempotencyKey: randomUUID(),
            },
          });
          await tx.classActivityQuestion.create({
            data: { activityId: activity.id, position: 0, type: "OPEN_ANSWER", gradingStrategy: "AI_REVIEW", statement: "x", expectedAnswer: "y", value: "1.00", ...question },
          });
        });
      await expect(writeAssignment({})).resolves.toBeUndefined();
      await expect(writeAssignment({ difficulty: "BASIC", points: 15 })).rejects.toThrow(/no difficulty, points or exercise/);
      await expect(writeAssignment({ sourceExerciseId: source })).rejects.toThrow(/no difficulty, points or exercise/);
    });

    it("013/FR-002 nível e pontos do snapshot não mudam", async () => {
      await expect(t.prisma.classActivityQuestion.update({ where: { id: exercise.questionIds[MC]! }, data: { difficulty: "ADVANCED", points: 60 } })).rejects.toThrow(
        /immutable/,
      );
    });
  });

  describe("tentativas numeradas (research K3)", () => {
    it("013/FR-005 uma tentativa aberta por vez: a segunda aberta é recusada", async () => {
      await attempt(1, false);
      await expect(attempt(1, false)).rejects.toThrow();
      await expect(t.prisma.$executeRawUnsafe(
        `INSERT INTO "activity_attempts" ("activity_id", "student_user_id", "number", "started_at", "updated_at") VALUES ($1::uuid, $2::uuid, 2, now(), now())`,
        exerciseId(),
        student.id,
      )).rejects.toThrow(/needs attempt 1 concluded|one_open/);
      await expect(attempt(1, false, other)).resolves.toBeTruthy();
    });

    it("013/FR-005 a tentativa n > 1 só depois da n − 1 concluída; a 3 sem a 2 é recusada", async () => {
      await expect(attempt(2, false)).rejects.toThrow(/needs attempt 1 concluded/);
      await attempt(1, true);
      await expect(attempt(3, false)).rejects.toThrow(/needs attempt 2 concluded/);
      await attempt(2, false);
      await expect(attempt(3, false)).rejects.toThrow(/needs attempt 2 concluded|one_open/);
      await expect(attempt(2, true, other)).rejects.toThrow(/needs attempt 1 concluded/);
    });

    it("013/FR-005 Trabalho continua com uma tentativa: a 2 é recusada mesmo com a 1 entregue", async () => {
      await createAttemptRow(t, assignment.activity.id, student.id, { submission: {} });
      await expect(attempt(2, false, student, assignment.activity.id)).rejects.toThrow(/single attempt/);
    });

    it("013/FR-007 concluída tem a hora da conclusão, que não muda; Trabalho não tem; a concluída não reabre", async () => {
      await expect(
        t.prisma.activityAttempt.create({ data: { activityId: exerciseId(), studentUserId: student.id, startedAt: new Date(), status: "SUBMITTED" } }),
      ).rejects.toThrow(/conclusion time/);
      await expect(
        t.prisma.activityAttempt.create({ data: { activityId: exerciseId(), studentUserId: student.id, startedAt: new Date(), completedAt: new Date() } }),
      ).rejects.toThrow(/conclusion time/);
      await expect(
        t.prisma.activityAttempt.create({
          data: { activityId: assignment.activity.id, studentUserId: student.id, startedAt: new Date(), status: "SUBMITTED", completedAt: new Date() },
        }),
      ).rejects.toThrow(/conclusion time/);
      const id = await attempt(1, false);
      await expect(t.prisma.activityAttempt.update({ where: { id }, data: { status: "SUBMITTED" } })).rejects.toThrow(/conclusion time/);
      await t.prisma.activityAttempt.update({ where: { id }, data: { status: "SUBMITTED", completedAt: new Date() } });
      await expect(t.prisma.activityAttempt.update({ where: { id }, data: { completedAt: new Date(Date.now() + 1_000) } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.activityAttempt.update({ where: { id }, data: { status: "IN_PROGRESS", completedAt: null } })).rejects.toThrow();
    });

    it("013/FR-007 Exercício não tem entrega nem correção por nota (research K5)", async () => {
      const id = await attempt(1, true);
      await expect(
        t.prisma.activitySubmission.create({
          data: { attemptId: id, activityId: exerciseId(), studentUserId: student.id, submittedAt: new Date(), late: false, blankCount: 0, grade: "0.00", gradePartial: true },
        }),
      ).rejects.toThrow(/not accepted/);
      await expect(
        t.prisma.$executeRawUnsafe(
          `INSERT INTO "activity_question_gradings" ("submission_id", "question_id", "activity_id", "status", "nature", "final_grade")
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'GRADED', 'RULE_RESULT', 0)`,
          randomUUID(),
          exercise.questionIds[MC],
          exerciseId(),
        ),
      ).rejects.toThrow(/not accepted/);
    });
  });

  describe("resultados por exercício (research K6, K8)", () => {
    it("013/FR-010 pontos tudo ou nada: só o Certo da linha que pontua vale os pontos da questão", async () => {
      const id = await attempt(1, true);
      await expect(result(id, MC, { points: 10 })).rejects.toThrow(/points_chk/);
      await expect(result(id, MC, { result: "WRONG", points: 15 })).rejects.toThrow(/points_chk/);
      await expect(result(id, MC, { questionPoints: 30 })).rejects.toThrow();
      await expect(result(id, MC)).resolves.toMatchObject({ points: 15 });
      await expect(result(id, OPEN, { result: "PENDING_TEACHER", nature: null })).resolves.toMatchObject({ points: 0 });
    });

    it("013/FR-009 aguardando correção só na linha que pontua; sem pontuação só fora dela; natureza conforme o resultado", async () => {
      const first = await attempt(1, true);
      await expect(result(first, OPEN, { result: "UNSCORED", nature: null })).rejects.toThrow(/scoring_chk/);
      await expect(result(first, OPEN, { result: "PENDING_TEACHER", nature: "RULE_RESULT" })).rejects.toThrow(/nature_chk/);
      await expect(result(first, MC, { nature: null })).rejects.toThrow(/nature_chk/);
      await expect(result(first, MC, { nature: "HUMAN_DECISION" })).rejects.toThrow(/nature_chk/);
      await result(first, MC);
      const second = await attempt(2, true);
      await expect(result(second, OPEN, { scoring: false, result: "PENDING_TEACHER", nature: null })).rejects.toThrow(/scoring_chk/);
      await expect(result(second, OPEN, { scoring: false, result: "UNSCORED", nature: null })).resolves.toMatchObject({ points: 0 });
    });

    it("013/FR-008 só a tentativa 1 pontua; tentativa aberta não tem resultado; turma e exercício são os da questão", async () => {
      const open = await attempt(1, false);
      await expect(result(open, MC)).rejects.toThrow(/not concluded/);
      await t.prisma.activityAttempt.update({ where: { id: open }, data: { status: "SUBMITTED", completedAt: new Date() } });
      const second = await attempt(2, true);
      await expect(result(second, MC)).rejects.toThrow(/only attempt 1 scores/);
      await expect(result(second, MC, { scoring: false, points: 0 })).resolves.toBeTruthy();
      const otherClass = (await createClassWithStudents(t, teacherId, { students: 0 })).schoolClass.id;
      await expect(result(open, MC, { classId: otherClass })).rejects.toThrow(/class/);
    });

    it("013/FR-010a o mesmo exercício pontua uma vez por aluno e turma, mesmo em outra atividade", async () => {
      const source = await sourceOf(MC);
      const again = await createActivity(t, { id: classId, teacherId }, { type: "EXERCISE", questions: [{ type: "MULTIPLE_CHOICE", sourceExerciseId: source }] });
      const first = await attempt(1, true);
      await result(first, MC);
      const elsewhere = await attempt(1, true, student, again.activity.id);
      await expect(result(elsewhere, 0, {}, student, again)).rejects.toThrow(/once_per_class/);
      await expect(result(elsewhere, 0, { scoring: false, points: 0 }, student, again)).resolves.toBeTruthy();
      // Another student scores the same exercise.
      const theirs = await attempt(1, true, other, again.activity.id);
      await expect(result(theirs, 0, {}, other, again)).resolves.toMatchObject({ points: 15 });
    });

    it("013/FR-017 só a marcação do professor muda, e só na linha que pontua de aberta ou código; nada é apagado", async () => {
      const first = await attempt(1, true);
      await result(first, MC);
      await result(first, OPEN, { result: "PENDING_TEACHER", nature: null });
      const key = (question: number) => ({ attemptId_questionId: { attemptId: first, questionId: exercise.questionIds[question]! } });

      await expect(
        t.prisma.exerciseQuestionResult.update({
          where: key(OPEN),
          data: { result: "CORRECT", points: 30, nature: "HUMAN_DECISION", decidedById: teacherId, decidedAt: new Date(), comment: "Boa" },
        }),
      ).resolves.toMatchObject({ points: 30 });
      await expect(t.prisma.exerciseQuestionResult.update({ where: key(MC), data: { result: "WRONG", points: 0 } })).rejects.toThrow(/not marked by the teacher/);
      await expect(t.prisma.exerciseQuestionResult.update({ where: key(OPEN), data: { scoring: false } })).rejects.toThrow(/only the mark/);
      await expect(t.prisma.exerciseQuestionResult.update({ where: key(OPEN), data: { questionPoints: 60 } })).rejects.toThrow();
      await expect(t.prisma.exerciseQuestionResult.delete({ where: key(OPEN) })).rejects.toThrow(/cannot be deleted/);

      const second = await attempt(2, true);
      await result(second, CODE, { scoring: false, result: "UNSCORED", nature: null });
      await expect(
        t.prisma.exerciseQuestionResult.update({
          where: { attemptId_questionId: { attemptId: second, questionId: exercise.questionIds[CODE]! } },
          data: { result: "WRONG", nature: "HUMAN_DECISION", decidedById: teacherId, decidedAt: new Date() },
        }),
      ).rejects.toThrow(/not marked by the teacher/);
    });
  });
});
