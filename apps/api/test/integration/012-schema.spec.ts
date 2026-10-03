import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 012 data-model.md, research P2, P7–P9, P12: the database refuses, by itself, what the activity
 * rules forbid — rows written by direct SQL or Prisma, without the API or its contracts in the way
 * (constitution V).
 */
describe("012/FR-002 012/FR-016 012/FR-017 012/FR-025 regras das atividades garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let classId: string;
  let student: TestUser;
  let other: TestUser;
  let created: CreatedActivity;

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
    created = await createActivity(t, schoolClass, {
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 40 },
        { type: "OPEN_ANSWER", valueCents: 30 },
        { type: "CODE", valueCents: 30 },
      ],
    });
  });

  const [MC, OPEN, CODE] = [0, 1, 2];
  const q = (index: number) => created.questionIds[index]!;
  const activityId = () => created.activity.id;

  const attempt = (studentUserId = student.id, status: "IN_PROGRESS" | "SUBMITTED" = "IN_PROGRESS", number = 1) =>
    t.prisma.activityAttempt.create({ data: { activityId: activityId(), studentUserId, number, status, startedAt: new Date() } });

  const answer = (attemptId: string, question: number, fields: Record<string, unknown>) =>
    t.prisma.activityAnswer.create({
      data: {
        attemptId,
        activityId: activityId(),
        questionId: q(question),
        questionType: (["MULTIPLE_CHOICE", "OPEN_ANSWER", "CODE"] as const)[question]!,
        savedAt: new Date(),
        ...fields,
      },
    });

  const submission = (attemptId: string, fields: Record<string, unknown> = {}) =>
    t.prisma.activitySubmission.create({
      data: {
        attemptId,
        activityId: activityId(),
        studentUserId: student.id,
        submittedAt: new Date(),
        late: false,
        blankCount: 0,
        grade: "0.00",
        gradePartial: true,
        ...fields,
      },
    });

  /**
   * A new ASSIGNMENT row plus its questions, written by SQL in one transaction (deferred triggers),
   * on the work and subject of the factory's activity (since 013 only an ASSIGNMENT has a grade).
   */
  const writeActivity = (activity: { total: string; count: number; publishAt?: string; deadline?: string }, questions: { value: string; position: number }[]) =>
    t.prisma.$transaction(async (tx) => {
      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO "class_activities" ("id", "class_id", "teacher_id", "type", "title", "total_grade", "question_count",
           "publish_at", "deadline", "late_policy", "idempotency_key", "source_work_id", "source_subject_id", "updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'ASSIGNMENT', 'Atividade', $4::numeric, $5, $6::timestamptz, $7::timestamptz,
           'REJECT', $8::uuid, $9::uuid, $10::uuid, now())`,
        id,
        classId,
        teacherId,
        activity.total,
        activity.count,
        activity.publishAt ?? "2026-10-01T00:00:00Z",
        activity.deadline ?? "2026-10-10T00:00:00Z",
        randomUUID(),
        created.activity.sourceWorkId,
        created.activity.sourceSubjectId,
      );
      for (const question of questions) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "class_activity_questions" ("activity_id", "position", "type", "grading_strategy", "value", "statement", "expected_answer")
           VALUES ($1::uuid, $2, 'OPEN_ANSWER', 'AI_REVIEW', $3::numeric, 'Enunciado', 'Resposta')`,
          id,
          question.position,
          question.value,
        );
      }
    });

  describe("atividade e snapshot (research P2, P6)", () => {
    it("o snapshot válido criado pela fábrica passa em todas as regras", async () => {
      const questions = await t.prisma.classActivityQuestion.findMany({ where: { activityId: activityId() }, orderBy: { position: "asc" } });
      expect(questions.map((question) => [question.type, question.gradingStrategy, question.value!.toFixed(2)])).toEqual([
        ["MULTIPLE_CHOICE", "EXACT_MATCH", "0.40"],
        ["OPEN_ANSWER", "AI_REVIEW", "0.30"],
        ["CODE", "TEST_CASES", "0.30"],
      ]);
    });

    it("soma dos valores ≠ nota total é recusada no commit", async () => {
      await expect(writeActivity({ total: "1.00", count: 1 }, [{ value: "0.50", position: 0 }])).rejects.toThrow(/add up to/);
      await expect(writeActivity({ total: "1.00", count: 2 }, [{ value: "0.50", position: 0 }, { value: "0.50", position: 1 }])).resolves.toBeUndefined();
    });

    it("0 e 11 questões são recusadas; posições com buraco também", async () => {
      await expect(writeActivity({ total: "1.00", count: 1 }, [])).rejects.toThrow(/needs 1 questions/);
      await expect(writeActivity({ total: "1.00", count: 11 }, [])).rejects.toThrow(/question_count_chk/);
      await expect(writeActivity({ total: "1.00", count: 2 }, [{ value: "0.50", position: 0 }, { value: "0.50", position: 2 }])).rejects.toThrow(
        /contiguous/,
      );
    });

    it("012/FR-005 prazo igual ou antes da publicação é recusado", async () => {
      await expect(
        writeActivity({ total: "1.00", count: 1, publishAt: "2026-10-10T00:00:00Z", deadline: "2026-10-10T00:00:00Z" }, [{ value: "1.00", position: 0 }]),
      ).rejects.toThrow(/schedule_chk/);
    });

    it("Múltipla escolha com 2 alternativas ou com 2 corretas é recusada", async () => {
      const schoolClass = { id: classId, teacherId };
      await expect(createActivity(t, schoolClass, { questions: [{ type: "MULTIPLE_CHOICE", alternatives: ["A", "B"] }] })).rejects.toThrow(/3 to 5/);
      const valid = await createActivity(t, schoolClass);
      await expect(
        t.prisma.$executeRawUnsafe(
          `INSERT INTO "class_activity_alternatives" ("question_id", "position", "text", "is_correct") VALUES ($1::uuid, 3, 'D', true)`,
          valid.questionIds[0],
        ),
      ).rejects.toThrow(/one_correct_key|immutable/);
    });

    it("estratégia trocada (Múltipla escolha com AI_REVIEW) é recusada", async () => {
      await expect(
        t.prisma.$transaction(async (tx) => {
          const id = randomUUID();
          await tx.$executeRawUnsafe(
            `INSERT INTO "class_activity_questions" ("activity_id", "position", "type", "grading_strategy", "value", "statement")
             VALUES ($1::uuid, 3, 'MULTIPLE_CHOICE', 'AI_REVIEW', 0.10, 'x')`,
            activityId(),
          );
          return id;
        }),
      ).rejects.toThrow(/grading_strategy_chk/);
    });

    it("o snapshot é imutável: questão, alternativa e a fonte, o tipo e a nota da atividade não mudam", async () => {
      await expect(t.prisma.classActivityQuestion.update({ where: { id: q(MC) }, data: { statement: "outro" } })).rejects.toThrow(/immutable/);
      await expect(
        t.prisma.classActivityAlternative.update({ where: { id: created.alternativeIds[MC]![0]! }, data: { isCorrect: false } }),
      ).rejects.toThrow(/immutable/);
      await expect(t.prisma.classActivityQuestion.delete({ where: { id: q(OPEN) } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.classActivity.update({ where: { id: activityId() }, data: { type: "EXERCISE" } })).rejects.toThrow();
      await expect(t.prisma.classActivity.update({ where: { id: activityId() }, data: { totalGrade: "2.00" } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.classActivity.update({ where: { id: activityId() }, data: { title: "Novo título" } })).resolves.toMatchObject({
        title: "Novo título",
      });
    });

    it("012/FR-004 cancelada não volta, encerrada não reabre", async () => {
      const id = activityId();
      await t.prisma.classActivity.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
      await expect(t.prisma.classActivity.update({ where: { id }, data: { status: "ACTIVE", closedAt: null } })).rejects.toThrow(/cannot go from/);
      await t.prisma.classActivity.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      await expect(t.prisma.classActivity.update({ where: { id }, data: { status: "CLOSED", cancelledAt: null } })).rejects.toThrow(/cannot go from/);
    });
  });

  describe("tentativa, respostas e entrega (research P7–P9)", () => {
    // 013 K3: numbered attempts exist only for EXERCISE; an ASSIGNMENT keeps one (trigger `activity_attempts_numbering`).
    it("012/FR-016 uma tentativa por aluno e atividade; number = 2 é recusado", async () => {
      await attempt();
      await expect(attempt()).rejects.toThrow();
      await expect(attempt(student.id, "IN_PROGRESS", 2)).rejects.toThrow(/single attempt/);
      await expect(attempt(student.id, "IN_PROGRESS", 0)).rejects.toThrow(/single attempt|number_chk/);
      await expect(attempt(other.id)).resolves.toBeTruthy();
    });

    it("012/FR-017 uma resposta por questão da tentativa", async () => {
      const { id } = await attempt();
      await answer(id, OPEN, { text: "Herança" });
      await expect(answer(id, OPEN, { text: "Outra" })).rejects.toThrow();
    });

    it("012/FR-020 a forma da resposta segue o tipo da questão", async () => {
      const { id } = await attempt();
      await expect(answer(id, MC, { text: "texto numa Múltipla escolha" })).rejects.toThrow(/shape_chk/);
      await expect(answer(id, OPEN, { source: "class A {}" })).rejects.toThrow(/shape_chk/);
      await expect(answer(id, CODE, { text: "x" })).rejects.toThrow(/shape_chk/);
      await expect(answer(id, MC, { alternativeId: null })).resolves.toBeTruthy();
    });

    it("o tipo informado precisa ser o da questão, e a alternativa precisa ser da própria questão", async () => {
      const { id } = await attempt();
      await expect(
        t.prisma.activityAnswer.create({
          data: { attemptId: id, activityId: activityId(), questionId: q(OPEN), questionType: "CODE", source: "x", savedAt: new Date() },
        }),
      ).rejects.toThrow();
      const another = await createActivity(t, { id: classId, teacherId });
      await expect(answer(id, MC, { alternativeId: another.alternativeIds[0]![0]! })).rejects.toThrow();
    });

    it("a questão precisa ser da atividade da tentativa", async () => {
      const another = await createActivity(t, { id: classId, teacherId });
      const { id } = await attempt();
      await expect(
        t.prisma.activityAnswer.create({
          data: {
            attemptId: id,
            activityId: activityId(),
            questionId: another.questionIds[0]!,
            questionType: "MULTIPLE_CHOICE",
            savedAt: new Date(),
          },
        }),
      ).rejects.toThrow();
    });

    it("012/FR-021 respostas de tentativa SUBMITTED não mudam; a tentativa não volta a IN_PROGRESS", async () => {
      const { id } = await attempt();
      const saved = await answer(id, OPEN, { text: "Herança" });
      await t.prisma.activityAttempt.update({ where: { id }, data: { status: "SUBMITTED" } });
      await expect(t.prisma.activityAnswer.update({ where: { id: saved.id }, data: { text: "mudou" } })).rejects.toThrow(/final/);
      await expect(answer(id, CODE, { source: "class A {}" })).rejects.toThrow(/final/);
      await expect(t.prisma.activityAnswer.delete({ where: { id: saved.id } })).rejects.toThrow(/final/);
      await expect(t.prisma.activityAttempt.update({ where: { id }, data: { status: "IN_PROGRESS" } })).rejects.toThrow(/cannot go back/);
    });

    it("012/FR-025 uma entrega por tentativa; o que foi entregue não muda nem é apagado", async () => {
      const { id } = await attempt();
      const first = await submission(id);
      await expect(submission(id)).rejects.toThrow();
      await expect(t.prisma.activitySubmission.update({ where: { id: first.id }, data: { submittedAt: new Date(0) } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.activitySubmission.update({ where: { id: first.id }, data: { late: true } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.activitySubmission.delete({ where: { id: first.id } })).rejects.toThrow(/cannot be deleted/);
      await expect(t.prisma.activitySubmission.update({ where: { id: first.id }, data: { generalFeedback: "Bom" } })).resolves.toMatchObject({
        generalFeedback: "Bom",
      });
    });

    it("a entrega é do aluno da tentativa; aceita pelo professor é sempre atrasada (FR-006b)", async () => {
      const { id } = await attempt();
      await expect(submission(id, { studentUserId: other.id })).rejects.toThrow();
      await expect(submission(id, { acceptedById: teacherId, late: false })).rejects.toThrow(/accepted_chk/);
      await expect(submission(id, { acceptedById: teacherId, late: true })).resolves.toBeTruthy();
    });
  });

  describe("correção por questão (research P12, 011/SC-011)", () => {
    let submissionId: string;

    beforeEach(async () => {
      const { id } = await attempt();
      submissionId = (await submission(id)).id;
    });

    const grading = (question: number, fields: Record<string, unknown>) =>
      t.prisma.activityQuestionGrading.create({ data: { submissionId, questionId: q(question), activityId: activityId(), ...fields } as never });

    it("nota final acima do valor da questão é recusada", async () => {
      await expect(grading(MC, { status: "GRADED", nature: "RULE_RESULT", finalGrade: "0.41" })).rejects.toThrow(/out of 0/);
      await expect(grading(MC, { status: "GRADED", nature: "RULE_RESULT", finalGrade: "0.40" })).resolves.toBeTruthy();
    });

    it("GRADED sem nota final e pendente sem motivo são recusados; motivo fora do contrato também", async () => {
      await expect(grading(MC, { status: "GRADED", nature: "RULE_RESULT" })).rejects.toThrow(/state_chk/);
      await expect(grading(OPEN, { status: "PENDING_TEACHER" })).rejects.toThrow(/state_chk/);
      await expect(grading(OPEN, { status: "PENDING_TEACHER", pendingReason: "QUALQUER" })).rejects.toThrow(/pending_reason_chk/);
      await expect(grading(OPEN, { status: "PENDING_TEACHER", pendingReason: "AI_REVIEW_UNAVAILABLE" })).resolves.toBeTruthy();
    });

    it("DECIDED exige a nota do professor igual à final, autor e data", async () => {
      await expect(grading(CODE, { status: "DECIDED", nature: "HUMAN_DECISION", finalGrade: "0.20", teacherGrade: "0.20" })).rejects.toThrow(
        /state_chk/,
      );
      await expect(
        grading(CODE, {
          status: "DECIDED",
          nature: "HUMAN_DECISION",
          finalGrade: "0.20",
          teacherGrade: "0.20",
          decidedById: teacherId,
          decidedAt: new Date(),
        }),
      ).resolves.toBeTruthy();
    });

    it("a correção é de uma questão da atividade da entrega", async () => {
      const another = await createActivity(t, { id: classId, teacherId });
      await expect(
        t.prisma.activityQuestionGrading.create({
          data: { submissionId, questionId: another.questionIds[0]!, activityId: activityId(), status: "GRADED", nature: "RULE_RESULT", finalGrade: "0.00" },
        }),
      ).rejects.toThrow();
    });
  });
});
