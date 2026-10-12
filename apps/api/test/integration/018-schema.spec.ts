import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AttemptIntegrityEventType, ExamEndReason, ExamHoldResolution, ExamOccurrenceKind } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { createExam } from "../helpers/exams";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, type ConfirmedSyllabus } from "../helpers/works";

const MINUTE = 60_000;

/**
 * 018 data-model.md, research T2–T9: the database refuses, by itself, what the Banco de Provas, the
 * EXAM activity, the occurrences and the holds forbid — rows written by Prisma, without the API in the
 * way (constitution V).
 */
describe("018/FR-001 018/FR-004 018/FR-017 018/FR-019 regras da prova garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let student: TestUser;
  let schoolClass: { id: string; teacherId: string };
  let syllabus: ConfirmedSyllabus;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    const created = await createClassWithStudents(t, teacherId, { students: 1 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
    syllabus = await createConfirmedSyllabus(t, teacherId);
  });

  describe("Banco de Provas (research T2)", () => {
    it("018/FR-001 de 1 a 20 questões, com a soma exata dos valores na nota total", async () => {
      const twenty = await createExam(t, teacherId, { syllabus, totalGrade: "10.00", questions: Array.from({ length: 20 }, () => ({})) });
      expect(twenty.questionCount).toBe(20);
      await expect(createExam(t, teacherId, { syllabus, totalGrade: "10.00", questions: Array.from({ length: 21 }, () => ({})) })).rejects.toThrow(
        /exams_question_count_chk/,
      );
      await expect(
        t.prisma.examQuestion.update({ where: { id: twenty.questions[0]!.id }, data: { value: "0.01" } }),
      ).rejects.toThrow(/add up to/);
      await expect(
        t.prisma.$transaction(async (tx) => {
          await tx.exam.update({ where: { id: twenty.id }, data: { questionCount: 19 } });
        }),
      ).rejects.toThrow(/needs 19 questions/);
    });

    it("018/FR-004 aprovar exige gabarito, dificuldade e tópico em toda questão; o rascunho pode esperar", async () => {
      await expect(createExam(t, teacherId, { syllabus, questions: [{ difficulty: null }] })).rejects.toThrow(/without a difficulty or a topic/);
      await expect(createExam(t, teacherId, { syllabus, questions: [{ topicItemIds: [] }] })).rejects.toThrow(/without a difficulty or a topic/);
      const draft = await createExam(t, teacherId, { syllabus, status: "DRAFT", questions: [{ difficulty: null, topicItemIds: [] }] });
      await expect(t.prisma.exam.update({ where: { id: draft.id }, data: { status: "APPROVED" } })).rejects.toThrow(/without a difficulty or a topic/);

      // The answer key: an open answer without its expected answer, or a choice without a correct alternative.
      const open = await createExam(t, teacherId, { syllabus, questions: [{ type: "OPEN_ANSWER" }] });
      await expect(t.prisma.examQuestion.update({ where: { id: open.questions[0]!.id }, data: { expectedAnswer: null } })).rejects.toThrow(
        /exam_questions_open_answer_chk/,
      );
      await expect(
        createExam(t, teacherId, {
          syllabus,
          questions: [{ alternatives: [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }, { text: "c", isCorrect: false }] }],
        }),
      ).rejects.toThrow(/exactly one correct/);
    });

    it("018/FR-002 a prova tem de 1 a 20 tópicos; a questão, de 1 a 3, só dos tópicos da prova", async () => {
      await expect(createExam(t, teacherId, { syllabus, topicItemIds: [], questions: [{ topicItemIds: [syllabus.itemIds[0]!] }] })).rejects.toThrow();
      await expect(createExam(t, teacherId, { syllabus, status: "DRAFT", topicItemIds: [], questions: [{ topicItemIds: [] }] })).rejects.toThrow(
        /1 to 20 topics/,
      );
      // A topic of the question outside the exam's topics: the composite FK.
      await expect(
        createExam(t, teacherId, { syllabus, topicItemIds: [syllabus.itemIds[0]!], questions: [{ topicItemIds: [syllabus.itemIds[1]!] }] }),
      ).rejects.toThrow(/exam_question_topics_exam_id_syllabus_item_id_fkey|Foreign key/);
      await expect(
        createExam(t, teacherId, { syllabus, topicItemIds: syllabus.itemIds.slice(0, 4), questions: [{ topicItemIds: syllabus.itemIds.slice(0, 4) }] }),
      ).rejects.toThrow(/more than 3 topics/);
      await expect(
        createExam(t, teacherId, { syllabus, topicItemIds: syllabus.itemIds.slice(0, 3), questions: [{ topicItemIds: syllabus.itemIds.slice(0, 3) }] }),
      ).resolves.toBeTruthy();
    });

    it("018/FR-004 origem imutável, pedido de geração só na gerada por IA, situação de restauração só na arquivada", async () => {
      const exam = await createExam(t, teacherId, { syllabus });
      await expect(t.prisma.exam.update({ where: { id: exam.id }, data: { origin: "AI_GENERATED" } })).rejects.toThrow(/immutable/);
      await expect(createExam(t, teacherId, { syllabus, origin: "AI_GENERATED", status: "DRAFT" })).rejects.toThrow(/exams_origin_chk/);
      await expect(t.prisma.exam.update({ where: { id: exam.id }, data: { status: "ARCHIVED" } })).rejects.toThrow(/exams_archived_chk/);
      await expect(
        t.prisma.exam.update({ where: { id: exam.id }, data: { status: "ARCHIVED", archivedFromStatus: "APPROVED" } }),
      ).resolves.toMatchObject({ status: "ARCHIVED" });
      await expect(t.prisma.exam.update({ where: { id: exam.id }, data: { archivedFromStatus: "ARCHIVED" } })).rejects.toThrow(/exams_archived_chk/);
    });
  });

  describe("a prova aplicada à turma (research T3)", () => {
    it("018/FR-010 sempre restrita, sem ajuda da IA, só para os presentes; sem prazo nem política de atraso", async () => {
      const exam = await createActivity(t, schoolClass, { type: "EXAM" });
      expect(exam.activity).toMatchObject({ type: "EXAM", executionMode: "CONTROLLED", aiHelpAllowance: 0, releaseMode: "PRESENT_ONLY", deadline: null });
      await expect(createActivity(t, schoolClass, { type: "EXAM", executionMode: "NORMAL" })).rejects.toThrow(/execution_mode_chk/);
      await expect(createActivity(t, schoolClass, { type: "EXAM", aiHelpAllowance: 3 })).rejects.toThrow(/ai_help_allowance_chk/);
      await expect(createActivity(t, schoolClass, { type: "EXAM", releaseMode: "ALL_ENROLLED" })).rejects.toThrow(/release_mode_chk/);
      const id = exam.activity.id;
      await expect(t.prisma.classActivity.update({ where: { id }, data: { deadline: new Date(Date.now() + MINUTE) } })).rejects.toThrow(
        /type_fields_chk/,
      );
      await expect(t.prisma.classActivity.update({ where: { id }, data: { latePolicy: "REJECT" } })).rejects.toThrow(/type_fields_chk/);
    });

    it("018/FR-007 duração de 1 a 120 min, inatividade de 30 a 60 s, limite para iniciar de 0 a 60 min; nada disso fora da prova", async () => {
      for (const durationMinutes of [1, 120]) await expect(createActivity(t, schoolClass, { type: "EXAM", durationMinutes })).resolves.toBeTruthy();
      for (const durationMinutes of [0, 121]) await expect(createActivity(t, schoolClass, { type: "EXAM", durationMinutes })).rejects.toThrow(/exam_chk/);
      for (const inactivityLimitSeconds of [29, 61]) {
        await expect(createActivity(t, schoolClass, { type: "EXAM", inactivityLimitSeconds })).rejects.toThrow(/exam_chk/);
      }
      for (const startWindowMinutes of [-1, 61]) {
        await expect(createActivity(t, schoolClass, { type: "EXAM", startWindowMinutes })).rejects.toThrow(/exam_chk/);
      }
      const work = await createActivity(t, schoolClass);
      expect(work.activity).toMatchObject({ durationMinutes: null, inactivityLimitSeconds: null, startWindowMinutes: null, sourceExamId: null });
      await expect(t.prisma.classActivity.update({ where: { id: work.activity.id }, data: { durationMinutes: 60 } })).rejects.toThrow(/immutable/);
    });

    it("018/FR-007 a fonte, a duração, a inatividade e o limite para iniciar da prova aplicada nunca mudam", async () => {
      const { activity } = await createActivity(t, schoolClass, { type: "EXAM" });
      for (const data of [{ durationMinutes: 90 }, { inactivityLimitSeconds: 30 }, { startWindowMinutes: 5 }, { sourceExamId: null }]) {
        await expect(t.prisma.classActivity.update({ where: { id: activity.id }, data }), JSON.stringify(data)).rejects.toThrow(/immutable/);
      }
      await expect(t.prisma.classActivity.update({ where: { id: activity.id }, data: { title: "Prova 1 — turma A" } })).resolves.toBeTruthy();
    });

    it("018/FR-001 até 20 questões na prova aplicada, com valor e dificuldade da prova; Trabalho e Exercício sem essa dificuldade", async () => {
      const twenty = Array.from({ length: 20 }, () => ({ type: "MULTIPLE_CHOICE" as const }));
      await expect(createActivity(t, schoolClass, { type: "EXAM", questions: twenty })).resolves.toBeTruthy();
      await expect(createActivity(t, schoolClass, { questions: Array.from({ length: 11 }, () => ({ type: "MULTIPLE_CHOICE" as const })) })).rejects.toThrow(
        /question_count_chk/,
      );
      await expect(createActivity(t, schoolClass, { type: "EXAM", questions: [{ type: "MULTIPLE_CHOICE", examDifficulty: null }] })).rejects.toThrow(
        /exam difficulty iff EXAM/,
      );
      await expect(createActivity(t, schoolClass, { questions: [{ type: "MULTIPLE_CHOICE", examDifficulty: "BASIC" }] })).rejects.toThrow(
        /exam difficulty iff EXAM/,
      );
      await expect(createActivity(t, schoolClass, { type: "EXERCISE", questions: [{ type: "MULTIPLE_CHOICE", examDifficulty: "BASIC" }] })).rejects.toThrow(
        /need an exercise/,
      );
    });
  });

  /** An exam with one multiple-choice question, a present student and their IN_PROGRESS attempt. */
  const startedExam = async (options: { startedAt?: Date; durationMinutes?: number } = {}) => {
    const created = await createActivity(t, schoolClass, { type: "EXAM", durationMinutes: options.durationMinutes });
    await t.prisma.activityAttendance.create({
      data: { activityId: created.activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: new Date(), markedById: teacherId },
    });
    const { attemptId } = await createAttemptRow(t, created.activity.id, student.id, { startedAt: options.startedAt });
    return { exam: created, attemptId };
  };
  const event = (exam: CreatedActivity, attemptId: string, type: AttemptIntegrityEventType = "SCREEN_LEFT", idleSeconds: number | null = null) =>
    t.prisma.attemptIntegrityEvent.create({
      data: {
        attemptId,
        activityId: exam.activity.id,
        studentUserId: student.id,
        clientEventId: randomUUID(),
        type,
        recordedAt: new Date(),
        idleSeconds,
      },
    });
  const occurrence = async (exam: CreatedActivity, attemptId: string, ordinal: number, kind: ExamOccurrenceKind = "SCREEN_LEFT") => {
    const first = await event(exam, attemptId, kind === "CLIPBOARD" ? "PASTE_BLOCKED" : kind, kind === "INACTIVITY" ? 60 : null);
    return t.prisma.examOccurrence.create({
      data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, ordinal, kind, firstEventId: first.id, recordedAt: first.recordedAt },
    });
  };
  /** Occurrences 1..count, then a hold on the last one. */
  const held = async (exam: CreatedActivity, attemptId: string, from = 1, to = 4) => {
    for (let ordinal = from; ordinal <= to; ordinal += 1) await occurrence(exam, attemptId, ordinal);
    return t.prisma.examAttemptHold.create({
      data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, occurrenceOrdinal: to, openedAt: new Date() },
    });
  };
  const resolve = (holdId: string, resolution: ExamHoldResolution, by = teacherId) =>
    t.prisma.examAttemptHold.update({ where: { id: holdId }, data: { resolution, resolvedAt: new Date(), resolvedById: by } });
  /** A submission row; CANCELLED writes the teacher's zero on every question in the same transaction. */
  const submit = (exam: CreatedActivity, attemptId: string, endReason: ExamEndReason | null, extra: { late?: boolean; grade?: string } = {}) =>
    t.prisma.$transaction(async (tx) => {
      const submission = await tx.activitySubmission.create({
        data: {
          attemptId,
          activityId: exam.activity.id,
          studentUserId: student.id,
          submittedAt: new Date(),
          late: extra.late ?? false,
          blankCount: 0,
          grade: extra.grade ?? "0.00",
          gradePartial: false,
          endReason,
          cancelledById: endReason === "CANCELLED" ? teacherId : null,
        },
      });
      if (endReason === "CANCELLED") {
        for (const questionId of exam.questionIds) {
          await tx.activityQuestionGrading.create({
            data: {
              submissionId: submission.id,
              questionId,
              activityId: exam.activity.id,
              status: "DECIDED",
              nature: "HUMAN_DECISION",
              finalGrade: "0.00",
              teacherGrade: "0.00",
              decidedById: teacherId,
              decidedAt: new Date(),
            },
          });
        }
      }
      return submission;
    });

  describe("entrega da prova (research T5, T9)", () => {
    it("018/FR-013 o motivo do fim existe só na prova, nunca muda, e o fim pelo tempo nunca é atraso", async () => {
      const { exam, attemptId } = await startedExam();
      await expect(submit(exam, attemptId, null)).rejects.toThrow(/end reason iff the activity is an exam/);
      await expect(submit(exam, attemptId, "TIME_EXPIRED", { late: true })).rejects.toThrow(/end_reason_chk/);
      const submission = await submit(exam, attemptId, "TIME_EXPIRED");
      await expect(t.prisma.activitySubmission.update({ where: { id: submission.id }, data: { endReason: "STUDENT_SUBMITTED" } })).rejects.toThrow(
        /immutable/,
      );

      const work = await createActivity(t, schoolClass);
      const { attemptId: workAttempt } = await createAttemptRow(t, work.activity.id, student.id);
      await expect(submit(work, workAttempt, "STUDENT_SUBMITTED")).rejects.toThrow(/end reason iff the activity is an exam/);
    });

    it("018/FR-021 o cancelamento confirmado tem quem confirmou e nota zero em toda questão, decidida pelo professor", async () => {
      const { exam, attemptId } = await startedExam();
      await expect(
        t.prisma.activitySubmission.create({
          data: {
            attemptId,
            activityId: exam.activity.id,
            studentUserId: student.id,
            submittedAt: new Date(),
            late: false,
            blankCount: 0,
            grade: "0.00",
            gradePartial: false,
            endReason: "CANCELLED",
          },
        }),
      ).rejects.toThrow(/cancelled_chk/);
      await expect(submit(exam, attemptId, "CANCELLED", { grade: "1.00" })).rejects.toThrow(/cancelled_chk/);
      // Without the teacher's zero on each question: refused at commit.
      await expect(
        t.prisma.activitySubmission.create({
          data: {
            attemptId,
            activityId: exam.activity.id,
            studentUserId: student.id,
            submittedAt: new Date(),
            late: false,
            blankCount: 0,
            grade: "0.00",
            gradePartial: false,
            endReason: "CANCELLED",
            cancelledById: teacherId,
          },
        }),
      ).rejects.toThrow(/every question decided with 0/);
      const cancelled = await submit(exam, attemptId, "CANCELLED");
      expect(cancelled).toMatchObject({ endReason: "CANCELLED", cancelledById: teacherId });
      await expect(
        t.prisma.activityQuestionGrading.update({
          where: { submissionId_questionId: { submissionId: cancelled.id, questionId: exam.questionIds[0]! } },
          data: { finalGrade: "1.00", teacherGrade: "1.00" },
        }),
      ).rejects.toThrow(/every question decided with 0/);
    });
  });

  describe("inatividade (research T7)", () => {
    it("018/FR-015 INACTIVITY só na prova, com 30 a 60 s de ociosidade, e só ele leva esse campo", async () => {
      const { exam, attemptId } = await startedExam();
      await expect(event(exam, attemptId, "INACTIVITY", 45)).resolves.toMatchObject({ idleSeconds: 45 });
      await expect(event(exam, attemptId, "INACTIVITY", 29)).rejects.toThrow(/idle_chk/);
      await expect(event(exam, attemptId, "INACTIVITY", null)).rejects.toThrow(/idle_chk/);
      await expect(event(exam, attemptId, "SCREEN_LEFT", 45)).rejects.toThrow(/idle_chk/);

      const work = await createActivity(t, schoolClass, { executionMode: "CONTROLLED" });
      const { attemptId: workAttempt } = await createAttemptRow(t, work.activity.id, student.id);
      await expect(event(work, workAttempt, "INACTIVITY", 45)).rejects.toThrow(/not of an exam/);
    });
  });

  describe("ocorrências (research T6)", () => {
    it("018/FR-017 ordinais sem lacuna, do tipo do evento que abriu, e nunca alterados nem apagados", async () => {
      const { exam, attemptId } = await startedExam();
      const first = await occurrence(exam, attemptId, 1);
      await expect(occurrence(exam, attemptId, 3)).rejects.toThrow(/must be 2/);
      await expect(occurrence(exam, attemptId, 1)).rejects.toThrow(/must be 2/);
      await expect(occurrence(exam, attemptId, 2, "CLIPBOARD")).resolves.toMatchObject({ ordinal: 2, kind: "CLIPBOARD" });
      await expect(occurrence(exam, attemptId, 3, "INACTIVITY")).resolves.toMatchObject({ ordinal: 3 });
      const screen = await event(exam, attemptId, "SCREEN_LEFT");
      await expect(
        t.prisma.examOccurrence.create({
          data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, ordinal: 4, kind: "FULLSCREEN_EXITED", firstEventId: screen.id, recordedAt: new Date() },
        }),
      ).rejects.toThrow(/cannot start with/);
      const key = { attemptId_ordinal: { attemptId, ordinal: first.ordinal } };
      await expect(t.prisma.examOccurrence.update({ where: key, data: { kind: "INACTIVITY" } })).rejects.toThrow(/append-only/);
      await expect(t.prisma.examOccurrence.delete({ where: key })).rejects.toThrow(/append-only/);
    });

    it("018/FR-020 nenhuma ocorrência fora da prova, com a tentativa pausada, retida ou entregue", async () => {
      const work = await createActivity(t, schoolClass, { executionMode: "CONTROLLED" });
      const { attemptId: workAttempt } = await createAttemptRow(t, work.activity.id, student.id);
      await expect(occurrence(work, workAttempt, 1)).rejects.toThrow(/not of an exam/);

      const paused = await startedExam();
      const pause = await t.prisma.attemptPause.create({
        data: {
          attemptId: paused.attemptId,
          activityId: paused.exam.activity.id,
          studentUserId: student.id,
          initiatedBy: "TEACHER",
          reason: "TEACHER",
          startedAt: new Date(),
          startedById: teacherId,
        },
      });
      // The pause refuses the event itself (016); the occurrence trigger refuses on its own too.
      await expect(occurrence(paused.exam, paused.attemptId, 1)).rejects.toThrow(/is paused/);
      await t.prisma.attemptPause.update({ where: { id: pause.id }, data: { releasedAt: new Date(), releasedById: teacherId } });

      const onHold = await startedExam();
      await held(onHold.exam, onHold.attemptId);
      const fact = await event(onHold.exam, onHold.attemptId);
      await expect(
        t.prisma.examOccurrence.create({
          data: { attemptId: onHold.attemptId, activityId: onHold.exam.activity.id, studentUserId: student.id, ordinal: 5, kind: "SCREEN_LEFT", firstEventId: fact.id, recordedAt: new Date() },
        }),
      ).rejects.toThrow(/on hold/);

      const submitted = await startedExam();
      const fact2 = await event(submitted.exam, submitted.attemptId);
      await submit(submitted.exam, submitted.attemptId, "STUDENT_SUBMITTED");
      await t.prisma.activityAttempt.update({ where: { id: submitted.attemptId }, data: { status: "SUBMITTED" } });
      await expect(
        t.prisma.examOccurrence.create({
          data: { attemptId: submitted.attemptId, activityId: submitted.exam.activity.id, studentUserId: student.id, ordinal: 1, kind: "SCREEN_LEFT", firstEventId: fact2.id, recordedAt: new Date() },
        }),
      ).rejects.toThrow(/not in progress/);
    });
  });

  describe("retenção \"Encerrada por avisos\" (research T8, T9)", () => {
    it("018/FR-018 abre só na 4ª ocorrência, uma aberta por tentativa, e outra só depois de uma devolução", async () => {
      const { exam, attemptId } = await startedExam();
      for (const ordinal of [1, 2, 3]) await occurrence(exam, attemptId, ordinal);
      await expect(
        t.prisma.examAttemptHold.create({ data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, occurrenceOrdinal: 3, openedAt: new Date() } }),
      ).rejects.toThrow(/ordinal_chk/);
      await occurrence(exam, attemptId, 4);
      const hold = await t.prisma.examAttemptHold.create({
        data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, occurrenceOrdinal: 4, openedAt: new Date() },
      });
      await expect(
        t.prisma.examAttemptHold.create({ data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, occurrenceOrdinal: 4, openedAt: new Date() } }),
      ).rejects.toThrow(/only after a return|one_open/);
      await resolve(hold.id, "RETURNED");
      const second = await held(exam, attemptId, 5, 5);
      expect(second.occurrenceOrdinal).toBe(5);
      await resolve(second.id, "CANCEL_CONFIRMED");
      await occurrence(exam, attemptId, 6);
      await expect(
        t.prisma.examAttemptHold.create({ data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, occurrenceOrdinal: 6, openedAt: new Date() } }),
      ).rejects.toThrow(/only after a return/);
    });

    it("018/FR-021 a decisão é uma só, do professor da turma, com horário e autor juntos; a retenção nunca é apagada", async () => {
      const { exam, attemptId } = await startedExam();
      const hold = await held(exam, attemptId);
      await expect(t.prisma.examAttemptHold.update({ where: { id: hold.id }, data: { resolution: "CANCEL_CONFIRMED" } })).rejects.toThrow(/resolved_chk/);
      const outsider = await createUser(t, { roles: ["TEACHER"] });
      await expect(resolve(hold.id, "CANCEL_CONFIRMED", outsider.id)).rejects.toThrow(/only the teacher/);
      await resolve(hold.id, "CANCEL_CONFIRMED");
      await expect(resolve(hold.id, "RETURNED")).rejects.toThrow(/already resolved/);
      await expect(t.prisma.examAttemptHold.update({ where: { id: hold.id }, data: { openedAt: new Date() } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.examAttemptHold.delete({ where: { id: hold.id } })).rejects.toThrow(/cannot be deleted/);
    });

    it("018/FR-022 devolver só enquanto há tempo e a atividade está ativa", async () => {
      const late = await startedExam({ startedAt: new Date(Date.now() - 61 * MINUTE), durationMinutes: 60 });
      const lateHold = await held(late.exam, late.attemptId);
      await expect(resolve(lateHold.id, "RETURNED")).rejects.toThrow(/no time left/);
      await expect(resolve(lateHold.id, "NOT_CANCELLED")).resolves.toMatchObject({ resolution: "NOT_CANCELLED" });

      const closed = await startedExam();
      const closedHold = await held(closed.exam, closed.attemptId);
      await t.prisma.classActivity.update({ where: { id: closed.exam.activity.id }, data: { status: "CLOSED", closedAt: new Date() } });
      await expect(resolve(closedHold.id, "RETURNED")).rejects.toThrow(/no time left/);

      const inTime = await startedExam();
      const inTimeHold = await held(inTime.exam, inTime.attemptId);
      await expect(resolve(inTimeHold.id, "RETURNED")).resolves.toMatchObject({ resolution: "RETURNED" });
    });
  });

  describe("gatilhos de defesa com a retenção aberta (016 M6 estendido)", () => {
    it("018/FR-019 sem resposta, entrega do aluno, ajuda ou pausa; os eventos ficam como fato", async () => {
      const { exam, attemptId } = await startedExam();
      await held(exam, attemptId);
      await expect(
        t.prisma.activityAnswer.create({
          data: {
            attemptId,
            activityId: exam.activity.id,
            questionId: exam.questionIds[0]!,
            questionType: "MULTIPLE_CHOICE",
            alternativeId: exam.alternativeIds[0]![0]!,
            savedAt: new Date(),
          },
        }),
      ).rejects.toThrow(/on hold/);
      await expect(submit(exam, attemptId, "STUDENT_SUBMITTED")).rejects.toThrow(/on hold/);
      await expect(submit(exam, attemptId, "TIME_EXPIRED")).rejects.toThrow(/on hold/);
      await expect(
        t.prisma.workHelpRequest.create({
          data: {
            attemptId,
            activityId: exam.activity.id,
            studentUserId: student.id,
            questionId: exam.questionIds[0]!,
            idempotencyKey: randomUUID(),
            question: "Como começo?",
            requestedAt: new Date(),
          },
        }),
      ).rejects.toThrow(/on hold/);
      await expect(
        t.prisma.attemptPause.create({
          data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, initiatedBy: "TEACHER", reason: "TEACHER", startedAt: new Date(), startedById: teacherId },
        }),
      ).rejects.toThrow(/on hold/);
      await expect(event(exam, attemptId, "SCREEN_LEFT")).resolves.toBeTruthy();
    });

    it("018/FR-021 018/FR-023 a decisão do professor grava a entrega: cancelamento confirmado ou não cancelada", async () => {
      const cancelled = await startedExam();
      await held(cancelled.exam, cancelled.attemptId);
      await expect(submit(cancelled.exam, cancelled.attemptId, "CANCELLED")).resolves.toMatchObject({ endReason: "CANCELLED" });

      const kept = await startedExam();
      await held(kept.exam, kept.attemptId);
      await expect(submit(kept.exam, kept.attemptId, "ENDED_BY_WARNINGS")).resolves.toMatchObject({ endReason: "ENDED_BY_WARNINGS" });
    });

    it("018/FR-013 com uma pausa aberta, o fim pelo tempo ainda grava a entrega; a do aluno não", async () => {
      const { exam, attemptId } = await startedExam();
      await t.prisma.attemptPause.create({
        data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, initiatedBy: "TEACHER", reason: "TEACHER", startedAt: new Date(), startedById: teacherId },
      });
      await expect(submit(exam, attemptId, "STUDENT_SUBMITTED")).rejects.toThrow(/is paused/);
      await expect(submit(exam, attemptId, "TIME_EXPIRED")).resolves.toMatchObject({ endReason: "TIME_EXPIRED" });
    });
  });
});
