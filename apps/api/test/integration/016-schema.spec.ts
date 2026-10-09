import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AttemptPauseInitiator, AttemptPauseReason } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 016 data-model.md, research M2, M3, M4, M6, M7: the database refuses, by itself, what the
 * attendance and the room exits forbid — rows written by Prisma, without the API in the way
 * (constitution V).
 */
describe("016/FR-001 016/FR-008 016/FR-013 regras da chamada e da pausa garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let student: TestUser;
  let other: TestUser;
  let schoolClass: { id: string; teacherId: string };
  /** PRESENT_ONLY work: one multiple-choice question. */
  let work: CreatedActivity;
  /** A work applied before 016 (ALL_ENROLLED). */
  let older: CreatedActivity;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    const created = await createClassWithStudents(t, teacherId, { students: 2 });
    schoolClass = created.schoolClass;
    [student, other] = created.students as [TestUser, TestUser];
    work = await createActivity(t, schoolClass, { releaseMode: "PRESENT_ONLY" });
    older = await createActivity(t, schoolClass);
  });

  const mark = (activity: CreatedActivity, who: TestUser = student, classId = schoolClass.id) =>
    t.prisma.activityAttendance.create({
      data: { activityId: activity.activity.id, studentUserId: who.id, classId, markedAt: new Date(), markedById: teacherId },
    });
  const unmark = (activity: CreatedActivity, who: TestUser = student) =>
    t.prisma.activityAttendance.delete({ where: { activityId_studentUserId: { activityId: activity.activity.id, studentUserId: who.id } } });
  /** An IN_PROGRESS attempt of a present student. */
  const started = async (activity: CreatedActivity = work, who: TestUser = student) => {
    if (activity.activity.releaseMode === "PRESENT_ONLY") await mark(activity, who);
    return (await createAttemptRow(t, activity.activity.id, who.id)).attemptId;
  };
  /** A pause of `attemptId`; a student's WATER exit unless overridden. */
  const pause = (
    attemptId: string,
    fields: { initiatedBy?: AttemptPauseInitiator; reason?: AttemptPauseReason; note?: string | null; releasedAt?: Date | null } = {},
    activity: CreatedActivity = work,
    who: TestUser = student,
  ) =>
    t.prisma.attemptPause.create({
      data: {
        attemptId,
        activityId: activity.activity.id,
        studentUserId: who.id,
        initiatedBy: fields.initiatedBy ?? "STUDENT",
        reason: fields.reason ?? "WATER",
        note: fields.note ?? null,
        startedAt: new Date(),
        startedById: fields.initiatedBy === "TEACHER" ? teacherId : who.id,
        ...(fields.releasedAt ? { releasedAt: fields.releasedAt, releasedById: teacherId } : {}),
      },
    });
  const release = (pauseId: string) =>
    t.prisma.attemptPause.update({ where: { id: pauseId }, data: { releasedAt: new Date(), releasedById: teacherId } });
  const close = (activity: CreatedActivity, status: "CLOSED" | "CANCELLED" = "CLOSED") =>
    t.prisma.classActivity.update({
      where: { id: activity.activity.id },
      data: status === "CLOSED" ? { status, closedAt: new Date() } : { status, cancelledAt: new Date() },
    });
  const answer = (attemptId: string, activity: CreatedActivity = work, alternative = 0) =>
    t.prisma.activityAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId: activity.questionIds[0]! } },
      create: {
        attemptId,
        activityId: activity.activity.id,
        questionId: activity.questionIds[0]!,
        questionType: "MULTIPLE_CHOICE",
        alternativeId: activity.alternativeIds[0]![alternative]!,
        savedAt: new Date(),
      },
      update: { alternativeId: activity.alternativeIds[0]![alternative]!, revision: { increment: 1 }, savedAt: new Date() },
    });
  const submission = (attemptId: string, acceptedById: string | null = null, activity: CreatedActivity = work, who: TestUser = student) =>
    t.prisma.activitySubmission.create({
      data: {
        attemptId,
        activityId: activity.activity.id,
        studentUserId: who.id,
        submittedAt: new Date(),
        late: acceptedById !== null,
        blankCount: 0,
        acceptedById,
        grade: "0.00",
        gradePartial: true,
      },
    });

  describe("modo de liberação da atividade (research M2)", () => {
    it("016/FR-007 só Trabalho fica PRESENT_ONLY; o Exercício e os trabalhos antigos ficam ALL_ENROLLED", async () => {
      await expect(createActivity(t, schoolClass, { type: "EXERCISE", releaseMode: "PRESENT_ONLY" })).rejects.toThrow(/release_mode_chk/);
      const exercise = await createActivity(t, schoolClass, { type: "EXERCISE" });
      expect(exercise.activity.releaseMode).toBe("ALL_ENROLLED");
      expect(older.activity.releaseMode).toBe("ALL_ENROLLED");
      expect(work.activity.releaseMode).toBe("PRESENT_ONLY");
    });

    it("016/FR-001 o modo de liberação nunca muda, nem antes da primeira tentativa", async () => {
      await expect(t.prisma.classActivity.update({ where: { id: work.activity.id }, data: { releaseMode: "ALL_ENROLLED" } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.classActivity.update({ where: { id: older.activity.id }, data: { releaseMode: "PRESENT_ONLY" } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.classActivity.update({ where: { id: work.activity.id }, data: { title: "Outro título" } })).resolves.toBeTruthy();
    });
  });

  describe("presença (research M3)", () => {
    it("016/FR-003 presença só em trabalho PRESENT_ONLY ativo, de aluno com matrícula ativa na turma da atividade", async () => {
      await expect(mark(work)).resolves.toBeTruthy();
      await expect(mark(older)).rejects.toThrow(/does not take attendance/);

      const closed = await createActivity(t, schoolClass, { releaseMode: "PRESENT_ONLY", status: "CLOSED" });
      await expect(mark(closed)).rejects.toThrow(/is not active/);
      const cancelled = await createActivity(t, schoolClass, { releaseMode: "PRESENT_ONLY", status: "CANCELLED" });
      await expect(mark(cancelled)).rejects.toThrow(/is not active/);

      const elsewhere = await createClassWithStudents(t, teacherId, { students: 1 });
      const outsider = elsewhere.students[0]!;
      await expect(mark(work, outsider)).rejects.toThrow(/no active enrollment/);
      await expect(mark(work, other, elsewhere.schoolClass.id)).rejects.toThrow(/must be in its class/);

      await t.prisma.enrollment.updateMany({
        where: { classId: schoolClass.id, studentUserId: other.id },
        data: { status: "REMOVED", removedAt: new Date(), removedById: teacherId },
      });
      await expect(mark(work, other)).rejects.toThrow(/no active enrollment/);
    });

    it("016/FR-003 presença só em turma ativa", async () => {
      await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "INACTIVE", statusChangedAt: new Date() } });
      await expect(mark(work)).rejects.toThrow(/class .* is not active/);
    });

    it("016/FR-004 a presença é uma por aluno e atividade e nunca é editada", async () => {
      const row = await mark(work);
      await expect(mark(work)).rejects.toThrow(/Unique constraint|unique/i);
      await expect(
        t.prisma.activityAttendance.update({
          where: { activityId_studentUserId: { activityId: row.activityId, studentUserId: row.studentUserId } },
          data: { markedAt: new Date(0) },
        }),
      ).rejects.toThrow(/never updated/);
    });

    it("016/FR-005 desmarcar só sem tentativa: com tentativa a presença fica", async () => {
      await mark(work);
      await expect(unmark(work)).resolves.toBeTruthy();
      await started(work);
      await expect(unmark(work)).rejects.toThrow(/already started/);
      await expect(t.prisma.activityAttendance.count({ where: { activityId: work.activity.id } })).resolves.toBe(1);
    });

    it("016/FR-008 a tentativa de trabalho PRESENT_ONLY exige a presença; ALL_ENROLLED e Exercício não", async () => {
      await expect(createAttemptRow(t, work.activity.id, student.id)).rejects.toThrow(/not present/);
      await mark(work);
      await expect(createAttemptRow(t, work.activity.id, student.id)).resolves.toBeTruthy();
      await expect(createAttemptRow(t, older.activity.id, other.id)).resolves.toBeTruthy();
      const exercise = await createActivity(t, schoolClass, { type: "EXERCISE" });
      await expect(createAttemptRow(t, exercise.activity.id, other.id)).resolves.toBeTruthy();
    });
  });

  describe("pausas (research M6, M7)", () => {
    it("016/FR-011 o motivo segue o iniciador; a nota só em Outro, com até 200 caracteres", async () => {
      const attemptId = await started();
      const invalid: [Parameters<typeof pause>[1], RegExp][] = [
        [{ initiatedBy: "STUDENT", reason: "TEACHER" }, /reason_chk/],
        [{ initiatedBy: "TEACHER", reason: "WATER" }, /reason_chk/],
        [{ reason: "WATER", note: "água" }, /note_chk/],
        [{ reason: "OTHER", note: "" }, /note_chk/],
        [{ reason: "OTHER", note: "x".repeat(201) }, /note_chk/],
      ];
      for (const [fields, error] of invalid) {
        await expect(pause(attemptId, fields), JSON.stringify(fields)).rejects.toThrow(error);
      }
      const valid: Parameters<typeof pause>[1][] = [
        { reason: "OTHER", note: "x".repeat(200) },
        { reason: "OTHER" },
        { reason: "BATHROOM" },
        { reason: "PHONE" },
        { initiatedBy: "TEACHER", reason: "TEACHER" },
      ];
      for (const fields of valid) {
        const created = await pause(attemptId, fields);
        await release(created.id);
      }
    });

    it("016/FR-011 uma pausa aberta por tentativa; liberada, outra pode abrir", async () => {
      const attemptId = await started();
      const first = await pause(attemptId);
      await expect(pause(attemptId)).rejects.toThrow(/Unique constraint|unique/i);
      await release(first.id);
      await expect(pause(attemptId)).resolves.toBeTruthy();
      await expect(pause(await started(work, other), {}, work, other)).resolves.toBeTruthy();
    });

    it("016/FR-011 pausa só em tentativa em andamento de trabalho PRESENT_ONLY ativo, e nasce aberta", async () => {
      await expect(pause(await started(older), {}, older)).rejects.toThrow(/does not take attendance/);
      const attemptId = await started();
      await expect(pause(attemptId, { releasedAt: new Date() })).rejects.toThrow(/starts open/);
      await t.prisma.activityAttempt.update({ where: { id: attemptId }, data: { status: "SUBMITTED" } });
      await expect(pause(attemptId)).rejects.toThrow(/not in progress/);

      const otherAttempt = await started(work, other);
      await close(work);
      await expect(pause(otherAttempt, {}, work, other)).rejects.toThrow(/is not active/);
    });

    it("016/FR-011 a pausa é da tentativa daquele aluno e daquela atividade", async () => {
      const attemptId = await started();
      await expect(pause(attemptId, {}, work, other)).rejects.toThrow(/foreign key|Foreign key/i);
    });

    it("016/FR-014 o retorno grava liberação e responsável juntos, uma vez; o resto da pausa não muda e ela não é apagada", async () => {
      const attemptId = await started();
      const open = await pause(attemptId);
      await expect(t.prisma.attemptPause.update({ where: { id: open.id }, data: { releasedAt: new Date() } })).rejects.toThrow(/released_chk/);
      await expect(t.prisma.attemptPause.update({ where: { id: open.id }, data: { reason: "BATHROOM" } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.attemptPause.update({ where: { id: open.id }, data: { startedAt: new Date(0) } })).rejects.toThrow(/immutable/);
      await release(open.id);
      await expect(release(open.id)).rejects.toThrow(/final/);
      await expect(t.prisma.attemptPause.delete({ where: { id: open.id } })).rejects.toThrow(/cannot be deleted/);
    });
  });

  describe("gatilhos de defesa com a pausa aberta (research M6)", () => {
    it("016/FR-013 resposta não é gravada nem alterada com a pausa aberta; depois do retorno, sim", async () => {
      const attemptId = await started();
      await answer(attemptId, work, 0);
      const open = await pause(attemptId);
      await expect(answer(attemptId, work, 1)).rejects.toThrow(/is paused/);
      await release(open.id);
      await expect(answer(attemptId, work, 1)).resolves.toBeTruthy();
    });

    it("016/FR-013 a entrega do aluno é recusada com a pausa aberta", async () => {
      const attemptId = await started();
      await pause(attemptId);
      await expect(submission(attemptId)).rejects.toThrow(/is paused/);
    });

    it("016/FR-015 a aceitação do professor passa com a pausa aberta: atividade ativa com prazo vencido, ou encerrada", async () => {
      const attemptId = await started();
      await pause(attemptId);
      await expect(submission(attemptId, teacherId)).resolves.toBeTruthy();

      const otherAttempt = await started(work, other);
      await pause(otherAttempt, {}, work, other);
      await close(work);
      await expect(submission(otherAttempt, teacherId, work, other)).resolves.toBeTruthy();
    });

    it("016/FR-015 com a atividade encerrada ou cancelada a pausa termina por derivação e não recusa mais a escrita", async () => {
      const attemptId = await started();
      await pause(attemptId);
      await close(work, "CANCELLED");
      await expect(answer(attemptId)).resolves.toBeTruthy();
    });

    it("016/FR-017 eventos da 015 são recusados com a pausa aberta", async () => {
      const controlled = await createActivity(t, schoolClass, { releaseMode: "PRESENT_ONLY", executionMode: "CONTROLLED" });
      const attemptId = await started(controlled);
      await pause(attemptId, {}, controlled);
      await expect(
        t.prisma.attemptIntegrityEvent.create({
          data: {
            attemptId,
            activityId: controlled.activity.id,
            studentUserId: student.id,
            clientEventId: randomUUID(),
            type: "SCREEN_LEFT",
            recordedAt: new Date(),
          },
        }),
      ).rejects.toThrow(/is paused/);
    });

    it("016/FR-013 pedido de ajuda novo é recusado com a pausa aberta; o pendente de antes ainda é resolvido", async () => {
      const helped = await createActivity(t, schoolClass, { releaseMode: "PRESENT_ONLY", aiHelpAllowance: 3 });
      const attemptId = await started(helped);
      const request = () =>
        t.prisma.workHelpRequest.create({
          data: {
            attemptId,
            activityId: helped.activity.id,
            studentUserId: student.id,
            questionId: helped.questionIds[0]!,
            idempotencyKey: randomUUID(),
            question: "Como eu começo?",
            requestedAt: new Date(),
          },
        });
      const pending = await request();
      await pause(attemptId, {}, helped);
      await expect(
        t.prisma.workHelpRequest.update({
          where: { id: pending.id },
          data: { status: "DELIVERED", message: "Pense no conceito.", resolvedAt: new Date() },
        }),
      ).resolves.toBeTruthy();
      await expect(request()).rejects.toThrow(/is paused/);
    });
  });
});
