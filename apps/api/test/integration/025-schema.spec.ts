import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { holdByHand } from "../helpers/exams";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const SECOND = 1_000;

/**
 * 025 data-model.md (research N1, N2): the database keeps, by itself, that a discreet warning goes only to an
 * exam attempt still running (in progress, not held, not paused), one pending per attempt, that only the
 * student's dismissal changes it, once, and that it leaves only with its attempt — rows written by Prisma,
 * without the API in the way.
 */
describe("025/FR-003 025/FR-004 025/FR-013 regras do aviso discreto garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacher: TestUser;
  let student: TestUser;
  let schoolClass: { id: string; teacherId: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
  });

  /** An EXAM activity with the student marked present (016) and their attempt in progress. */
  const examAttempt = async () => {
    const { activity } = await createActivity(t, schoolClass, { type: "EXAM" });
    await t.prisma.activityAttendance.create({
      data: { activityId: activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: new Date(), markedById: teacher.id },
    });
    const { attemptId } = await createAttemptRow(t, activity.id, student.id);
    return { activityId: activity.id, attemptId };
  };

  const nudge = (ids: { activityId: string; attemptId: string }, data: Record<string, unknown> = {}) =>
    t.prisma.examNudge.create({
      data: { attemptId: ids.attemptId, activityId: ids.activityId, sentByUserId: teacher.id, sentAt: new Date(), ...data },
    });

  describe("insert (exam_nudges_insert_valid)", () => {
    it("025/FR-004 entra numa tentativa de prova em andamento", async () => {
      const ids = await examAttempt();
      const row = await nudge(ids);
      expect(row).toMatchObject({ attemptId: ids.attemptId, activityId: ids.activityId, sentByUserId: teacher.id, dismissedAt: null });
    });

    it("025/FR-004 recusa uma tentativa entregue", async () => {
      const ids = await examAttempt();
      await t.prisma.activitySubmission.create({
        data: {
          attemptId: ids.attemptId,
          activityId: ids.activityId,
          studentUserId: student.id,
          submittedAt: new Date(),
          late: false,
          blankCount: 0,
          grade: "0.00",
          gradePartial: false,
          endReason: "STUDENT_SUBMITTED",
          submittedByUserId: student.id,
        },
      });
      await t.prisma.activityAttempt.update({ where: { id: ids.attemptId }, data: { status: "SUBMITTED" } });
      await expect(nudge(ids)).rejects.toThrow(/exam_nudges/);
    });

    it("025/FR-004 recusa uma tentativa de trabalho ou de exercício", async () => {
      const work = await createActivity(t, schoolClass, { executionMode: "CONTROLLED" });
      const { attemptId: workAttempt } = await createAttemptRow(t, work.activity.id, student.id);
      await expect(nudge({ activityId: work.activity.id, attemptId: workAttempt })).rejects.toThrow(/exam_nudges/);

      const exercise = await createActivity(t, schoolClass, { type: "EXERCISE" });
      const { attemptId: exerciseAttempt } = await createAttemptRow(t, exercise.activity.id, student.id);
      await expect(nudge({ activityId: exercise.activity.id, attemptId: exerciseAttempt })).rejects.toThrow(/exam_nudges/);
    });

    it("025/FR-010 recusa uma tentativa retida (decisão do professor pendente)", async () => {
      const ids = await examAttempt();
      await holdByHand(t, { id: ids.attemptId, activityId: ids.activityId, studentUserId: student.id });
      await expect(nudge(ids)).rejects.toThrow(/exam_nudges/);
    });

    it("025/FR-010 recusa uma tentativa pausada; depois do retorno liberado, entra", async () => {
      const ids = await examAttempt();
      const pause = await t.prisma.attemptPause.create({
        data: {
          attemptId: ids.attemptId,
          activityId: ids.activityId,
          studentUserId: student.id,
          initiatedBy: "TEACHER",
          reason: "TEACHER",
          startedAt: new Date(),
          startedById: teacher.id,
        },
      });
      await expect(nudge(ids)).rejects.toThrow(/exam_nudges/);
      await t.prisma.attemptPause.update({ where: { id: pause.id }, data: { releasedAt: new Date(), releasedById: teacher.id } });
      await expect(nudge(ids)).resolves.toBeDefined();
    });

    it("025/FR-004 recusa uma atividade diferente da tentativa", async () => {
      const ids = await examAttempt();
      const other = await examAttempt();
      await expect(nudge({ activityId: other.activityId, attemptId: ids.attemptId })).rejects.toThrow(/exam_nudges/);
    });

    it("025/FR-011 recusa um aviso que já nasce fechado", async () => {
      const ids = await examAttempt();
      await expect(nudge(ids, { dismissedAt: new Date() })).rejects.toThrow(/exam_nudges/);
    });
  });

  describe("um pendente por tentativa (exam_nudges_one_pending)", () => {
    it("025/FR-003 um segundo pendente falha; depois de fechado, um novo entra", async () => {
      const ids = await examAttempt();
      const first = await nudge(ids);
      await expect(nudge(ids)).rejects.toThrow(/exam_nudges_one_pending/);
      await t.prisma.examNudge.update({ where: { id: first.id }, data: { dismissedAt: new Date() } });
      const second = await nudge(ids);
      expect(second.id).not.toBe(first.id);
      expect(await t.prisma.examNudge.count({ where: { attemptId: ids.attemptId } })).toBe(2);
    });
  });

  describe("update e delete (exam_nudges_update_guard, exam_nudges_no_delete)", () => {
    it("025/FR-011 o fechamento não é anterior ao envio", async () => {
      const ids = await examAttempt();
      const sentAt = new Date();
      const row = await nudge(ids, { sentAt });
      await expect(t.prisma.examNudge.update({ where: { id: row.id }, data: { dismissedAt: new Date(sentAt.getTime() - SECOND) } })).rejects.toThrow(
        /exam_nudges_dismissed_chk/,
      );
      await expect(t.prisma.examNudge.update({ where: { id: row.id }, data: { dismissedAt: sentAt } })).resolves.toBeDefined();
    });

    it("025/FR-013 só o fechamento muda, uma vez: envio, tentativa e um fechamento já gravado ficam", async () => {
      const ids = await examAttempt();
      const row = await nudge(ids);
      await expect(t.prisma.examNudge.update({ where: { id: row.id }, data: { sentAt: new Date(Date.now() + SECOND) } })).rejects.toThrow(/exam_nudges/);
      const other = await examAttempt();
      await expect(t.prisma.examNudge.update({ where: { id: row.id }, data: { attemptId: other.attemptId } })).rejects.toThrow(/exam_nudges/);
      await expect(t.prisma.examNudge.update({ where: { id: row.id }, data: { sentByUserId: student.id } })).rejects.toThrow(/exam_nudges/);

      const dismissedAt = new Date(Date.now() + SECOND);
      await t.prisma.examNudge.update({ where: { id: row.id }, data: { dismissedAt } });
      await expect(t.prisma.examNudge.update({ where: { id: row.id }, data: { dismissedAt: new Date(dismissedAt.getTime() + SECOND) } })).rejects.toThrow(
        /exam_nudges/,
      );
      await expect(t.prisma.examNudge.update({ where: { id: row.id }, data: { dismissedAt: null } })).rejects.toThrow(/exam_nudges/);
    });

    it("025/FR-013 não se apaga um aviso direto; com a tentativa, ele sai em cascata", async () => {
      const ids = await examAttempt();
      const row = await nudge(ids);
      await expect(t.prisma.examNudge.delete({ where: { id: row.id } })).rejects.toThrow(/exam_nudges/);
      // The app never deletes an attempt (023's participants are immutable and restrict it); should one go, its
      // warnings go with it. The participants' guard is lifted only inside this transaction (DDL is transactional).
      await t.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE "attempt_participants" DISABLE TRIGGER "attempt_participants_immutable"');
        await tx.attemptParticipant.deleteMany({ where: { attemptId: ids.attemptId } });
        await tx.activityAttempt.delete({ where: { id: ids.attemptId } });
        await tx.$executeRawUnsafe('ALTER TABLE "attempt_participants" ENABLE TRIGGER "attempt_participants_immutable"');
      });
      expect(await t.prisma.examNudge.count({ where: { id: row.id } })).toBe(0);
    });
  });

  it("025/FR-005 a permissão provas.avisos.enviar existe e só o papel TEACHER a tem", async () => {
    const permission = await t.prisma.permission.findUnique({ where: { key: "provas.avisos.enviar" } });
    expect(permission?.description).toBe("Enviar aviso discreto a um aluno durante a prova");
    const grants = await t.prisma.rolePermission.findMany({
      where: { permission: { key: "provas.avisos.enviar" } },
      select: { role: { select: { key: true } } },
    });
    expect(grants.map((grant) => grant.role.key)).toEqual(["TEACHER"]);
  });

  it("025/FR-004 um id de tentativa inexistente é recusado pela chave estrangeira", async () => {
    const ids = await examAttempt();
    await expect(nudge({ activityId: ids.activityId, attemptId: randomUUID() })).rejects.toThrow();
  });
});
