import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createAttemptRow, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { API_ROOT } from "../helpers/env";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MINUTE = 60_000;
const PUBLIC_CASE = [{ input: "1\n", expectedOutput: "2\n", visibility: "PUBLIC" as const }];

/**
 * 023 data-model.md (research U2–U4, U8, U10): the database keeps, by itself, who takes part in an attempt,
 * that a group has one leader and one editor among them, that only the editor writes and only the leader
 * submits, that every save is logged by student, and that a pause stops only its own student (constitution V).
 */
describe("023/FR-001 023/FR-008 023/FR-012 023/FR-015 023/FR-021 023/FR-023 regras do trabalho em grupo garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let schoolClass: { id: string; teacherId: string };
  let a: TestUser, b: TestUser, c: TestUser, d: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    const created = await createClassWithStudents(t, teacherId, {
      students: 4,
    });
    schoolClass = created.schoolClass;
    [a, b, c, d] = created.students as [TestUser, TestUser, TestUser, TestUser];
  });

  /** A PRESENT_ONLY work with a multiple-choice question and a CODE one, help and code execution on. */
  const groupWork = (groupSize: number | null = 3) =>
    createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      groupSize,
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      codeExecutionAllowed: true,
      questions: [{ type: "MULTIPLE_CHOICE" }, { type: "CODE", languageKey: "python", testCases: PUBLIC_CASE }],
    });

  const present = (activity: CreatedActivity, ...who: TestUser[]) =>
    t.prisma.activityAttendance.createMany({
      data: who.map((student) => ({
        activityId: activity.activity.id,
        studentUserId: student.id,
        classId: schoolClass.id,
        markedAt: new Date(),
        markedById: teacherId,
      })),
    });

  /** The owner's attempt (its participant row comes with it) and, with `members`, the group led by the owner. */
  const attemptOf = async (activity: CreatedActivity, owner: TestUser, members: TestUser[] = []) => {
    const { attemptId } = await createAttemptRow(t, activity.activity.id, owner.id);
    if (activity.activity.groupSize !== null) {
      await t.prisma.attemptGroup.create({
        data: {
          attemptId,
          activityId: activity.activity.id,
          leaderUserId: owner.id,
          editorUserId: owner.id,
          createdAt: new Date(),
        },
      });
    }
    for (const member of members) await join(activity, attemptId, member, owner);
    return attemptId;
  };

  const join = (activity: CreatedActivity, attemptId: string, member: TestUser, addedBy: TestUser) =>
    t.prisma.attemptParticipant.create({
      data: {
        attemptId,
        activityId: activity.activity.id,
        studentUserId: member.id,
        attemptNumber: 1,
        joinedAt: new Date(),
        addedByUserId: addedBy.id,
      },
    });

  const setEditor = (attemptId: string, editor: TestUser) =>
    t.prisma.attemptGroup.update({
      where: { attemptId },
      data: { editorUserId: editor.id, version: { increment: 1 } },
    });

  /** Writes the multiple-choice answer as `by`: the first time an insert, then a new revision. */
  const save = (activity: CreatedActivity, attemptId: string, by: TestUser, alternative = 0) =>
    t.prisma.activityAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId: activity.questionIds[0]!,
        },
      },
      create: {
        attemptId,
        activityId: activity.activity.id,
        questionId: activity.questionIds[0]!,
        questionType: "MULTIPLE_CHOICE",
        alternativeId: activity.alternativeIds[0]![alternative]!,
        savedAt: new Date(),
        savedByUserId: by.id,
      },
      update: {
        alternativeId: activity.alternativeIds[0]![alternative]!,
        revision: { increment: 1 },
        savedAt: new Date(),
        savedByUserId: by.id,
      },
    });

  /** In one transaction, the attempt goes SUBMITTED and gets its submission by `by` (null: the teacher's acceptance). */
  const submit = (activity: CreatedActivity, attemptId: string, owner: TestUser, by: TestUser | null) =>
    t.prisma.$transaction(async (tx) => {
      await tx.activityAttempt.update({
        where: { id: attemptId },
        data: { status: "SUBMITTED" },
      });
      return tx.activitySubmission.create({
        data: {
          attemptId,
          activityId: activity.activity.id,
          studentUserId: owner.id,
          submittedByUserId: by?.id ?? null,
          acceptedById: by ? null : teacherId,
          submittedAt: new Date(),
          late: by === null,
          blankCount: 0,
          grade: "0.00",
          gradePartial: true,
        },
      });
    });

  const pause = (activity: CreatedActivity, attemptId: string, who: TestUser) =>
    t.prisma.attemptPause.create({
      data: {
        attemptId,
        activityId: activity.activity.id,
        studentUserId: who.id,
        initiatedBy: "STUDENT",
        reason: "WATER",
        startedAt: new Date(),
        startedById: who.id,
      },
    });

  const setGroupSize = (activity: CreatedActivity, groupSize: number | null) =>
    t.prisma.classActivity.update({
      where: { id: activity.activity.id },
      data: { groupSize },
    });

  describe("o formato do trabalho (research U2)", () => {
    it("023/FR-001 023/FR-003 NULL ou 2–5 num Trabalho com chamada; 1 e 6 recusados; recusado em Exercício, Prova e Trabalho sem chamada", async () => {
      const work = await groupWork(null);
      for (const size of [2, 3, 4, 5, null]) await expect(setGroupSize(work, size)).resolves.toBeTruthy();
      for (const size of [1, 6]) await expect(setGroupSize(work, size)).rejects.toThrow(/group_size_chk/);

      const exercise = await createActivity(t, schoolClass, {
        type: "EXERCISE",
      });
      const exam = await createActivity(t, schoolClass, { type: "EXAM" });
      const allEnrolled = await createActivity(t, schoolClass);
      for (const activity of [exercise, exam, allEnrolled]) await expect(setGroupSize(activity, 3)).rejects.toThrow(/group_size_chk/);
    });

    it("023/FR-002 muda antes da primeira tentativa e é recusado depois (trigger)", async () => {
      const work = await groupWork(3);
      await expect(setGroupSize(work, 2)).resolves.toBeTruthy();
      await present(work, a);
      await createAttemptRow(t, work.activity.id, a.id);
      await expect(setGroupSize(work, 4)).rejects.toThrow(/group size of activity .* is fixed/);
      await expect(setGroupSize(work, null)).rejects.toThrow(/group size of activity .* is fixed/);
      // Other columns still change after the start.
      await expect(
        t.prisma.classActivity.update({
          where: { id: work.activity.id },
          data: { title: "Outro título" },
        }),
      ).resolves.toBeTruthy();
    });
  });

  describe("participantes (research U3)", () => {
    it("023/FR-008 toda tentativa nova tem a linha do dono, com o número dela e sem quem incluiu", async () => {
      const exercise = await createActivity(t, schoolClass, {
        type: "EXERCISE",
      });
      const first = await createAttemptRow(t, exercise.activity.id, a.id, {
        completedAt: new Date(),
      });
      const second = await createAttemptRow(t, exercise.activity.id, a.id, {
        number: 2,
      });
      const rows = await t.prisma.attemptParticipant.findMany({
        where: { activityId: exercise.activity.id },
        orderBy: { attemptNumber: "asc" },
      });
      expect(
        rows.map(({ attemptId, studentUserId, attemptNumber, addedByUserId }) => ({
          attemptId,
          studentUserId,
          attemptNumber,
          addedByUserId,
        })),
      ).toEqual([
        {
          attemptId: first.attemptId,
          studentUserId: a.id,
          attemptNumber: 1,
          addedByUserId: null,
        },
        {
          attemptId: second.attemptId,
          studentUserId: a.id,
          attemptNumber: 2,
          addedByUserId: null,
        },
      ]);
    });

    it("023/FR-008 o mesmo aluno não participa de duas tentativas 1 do mesmo trabalho", async () => {
      const work = await groupWork(3);
      await present(work, a, b);
      await attemptOf(work, a, [b]);
      await expect(createAttemptRow(t, work.activity.id, b.id)).rejects.toThrow(
        /attempt_participants_activity_id_student_user_id_attempt_nu_key|Unique constraint/,
      );
      expect(
        await t.prisma.activityAttempt.count({
          where: { activityId: work.activity.id },
        }),
      ).toBe(1);
    });

    it("023/FR-008 integrante só com grupo, dentro do tamanho, com a tentativa em andamento e o aluno presente", async () => {
      const individual = await createActivity(t, schoolClass, {
        releaseMode: "PRESENT_ONLY",
      });
      await present(individual, a, b);
      const alone = await attemptOf(individual, a);
      await expect(join(individual, alone, b, a)).rejects.toThrow(/is not a group/);

      const work = await groupWork(2);
      await present(work, a, b, c);
      const grouped = await attemptOf(work, a, [b]);
      await expect(join(work, grouped, c, a)).rejects.toThrow(/is full/);

      const larger = await groupWork(4);
      await present(larger, a, b);
      const open = await attemptOf(larger, a);
      await expect(join(larger, open, d, a)).rejects.toThrow(/is not present/);
      await expect(
        t.prisma.attemptParticipant.create({
          data: {
            attemptId: open,
            activityId: larger.activity.id,
            studentUserId: b.id,
            attemptNumber: 1,
            joinedAt: new Date(),
            addedByUserId: null,
          },
        }),
      ).rejects.toThrow(/only the owner/);
      await t.prisma.activityAttempt.update({
        where: { id: open },
        data: { status: "SUBMITTED" },
      });
      await expect(join(larger, open, b, a)).rejects.toThrow(/is not in progress/);
    });

    it("023/FR-008 um participante nunca muda nem sai", async () => {
      const work = await groupWork(3);
      await present(work, a, b);
      const attemptId = await attemptOf(work, a, [b]);
      const key = {
        attemptId_studentUserId: { attemptId, studentUserId: b.id },
      };
      await expect(t.prisma.attemptParticipant.delete({ where: key })).rejects.toThrow(/never changed or removed/);
      await expect(
        t.prisma.attemptParticipant.update({
          where: key,
          data: { joinedAt: new Date() },
        }),
      ).rejects.toThrow(/never changed or removed/);
      expect(await t.prisma.attemptParticipant.count({ where: { attemptId } })).toBe(2);
    });
  });

  describe("o grupo (research U3, U7)", () => {
    it("023/FR-013 nasce com o dono liderando e editando, só num trabalho em grupo e com a tentativa em andamento", async () => {
      const individual = await createActivity(t, schoolClass, {
        releaseMode: "PRESENT_ONLY",
      });
      await present(individual, a);
      const { attemptId: alone } = await createAttemptRow(t, individual.activity.id, a.id);
      await expect(
        t.prisma.attemptGroup.create({
          data: {
            attemptId: alone,
            activityId: individual.activity.id,
            leaderUserId: a.id,
            editorUserId: a.id,
            createdAt: new Date(),
          },
        }),
      ).rejects.toThrow(/is not a group work/);

      const work = await groupWork(3);
      await present(work, a, b);
      const { attemptId } = await createAttemptRow(t, work.activity.id, a.id);
      await expect(
        t.prisma.attemptGroup.create({
          data: {
            attemptId,
            activityId: work.activity.id,
            leaderUserId: a.id,
            editorUserId: b.id,
            createdAt: new Date(),
          },
        }),
      ).rejects.toThrow();
      await expect(
        t.prisma.attemptGroup.create({
          data: {
            attemptId,
            activityId: work.activity.id,
            leaderUserId: a.id,
            editorUserId: a.id,
            createdAt: new Date(),
          },
        }),
      ).resolves.toMatchObject({
        leaderUserId: a.id,
        editorUserId: a.id,
        version: 1,
      });
    });

    it("023/FR-013 líder e editor são participantes; só eles e a versão mudam, e só com a tentativa em andamento; nunca é apagado", async () => {
      const work = await groupWork(3);
      await present(work, a, b, c);
      const attemptId = await attemptOf(work, a, [b]);
      await expect(setEditor(attemptId, c)).rejects.toThrow(/Foreign key|foreign key/);
      await expect(setEditor(attemptId, b)).resolves.toMatchObject({
        editorUserId: b.id,
        version: 2,
      });
      await expect(
        t.prisma.attemptGroup.update({
          where: { attemptId },
          data: { leaderUserId: b.id },
        }),
      ).resolves.toMatchObject({ leaderUserId: b.id });
      await expect(
        t.prisma.attemptGroup.update({
          where: { attemptId },
          data: { createdAt: new Date(Date.now() + MINUTE) },
        }),
      ).rejects.toThrow(/only the leader, the editor and the version/);
      await expect(t.prisma.attemptGroup.delete({ where: { attemptId } })).rejects.toThrow(/cannot be deleted/);
      await t.prisma.activityAttempt.update({
        where: { id: attemptId },
        data: { status: "SUBMITTED" },
      });
      await expect(setEditor(attemptId, a)).rejects.toThrow(/its group is final/);
    });
  });

  describe("registros (research U7, U8)", () => {
    it("023/FR-015 cada INSERT ou nova revisão de uma resposta acrescenta quem salvou, sem conteúdo", async () => {
      const work = await groupWork(3);
      await present(work, a, b);
      const attemptId = await attemptOf(work, a, [b]);
      await save(work, attemptId, a, 0);
      await setEditor(attemptId, b);
      await save(work, attemptId, b, 1);
      const saves = await t.prisma.activityAnswerSave.findMany({
        where: { attemptId },
        orderBy: { revision: "asc" },
      });
      expect(
        saves.map(({ questionId, revision, studentUserId }) => ({
          questionId,
          revision,
          studentUserId,
        })),
      ).toEqual([
        { questionId: work.questionIds[0], revision: 1, studentUserId: a.id },
        { questionId: work.questionIds[0], revision: 2, studentUserId: b.id },
      ]);
      // A change that keeps the revision (none of the save paths does it) logs nothing.
      await t.prisma.activityAnswer.update({
        where: {
          attemptId_questionId: { attemptId, questionId: work.questionIds[0]! },
        },
        data: { savedAt: new Date() },
      });
      expect(await t.prisma.activityAnswerSave.count({ where: { attemptId } })).toBe(2);
    });

    it("023/FR-015 o histórico de salvamentos e o de edição só aceitam INSERT", async () => {
      const work = await groupWork(3);
      await present(work, a, b);
      const attemptId = await attemptOf(work, a, [b]);
      await save(work, attemptId, a);
      const key = {
        attemptId_questionId_revision: {
          attemptId,
          questionId: work.questionIds[0]!,
          revision: 1,
        },
      };
      await expect(
        t.prisma.activityAnswerSave.update({
          where: key,
          data: { savedAt: new Date() },
        }),
      ).rejects.toThrow(/append-only/);
      await expect(t.prisma.activityAnswerSave.delete({ where: key })).rejects.toThrow(/append-only/);

      const event = await t.prisma.attemptGroupEvent.create({
        data: {
          attemptId,
          kind: "EDITING_HANDED",
          actorUserId: a.id,
          fromUserId: a.id,
          toUserId: b.id,
          occurredAt: new Date(),
        },
      });
      await expect(
        t.prisma.attemptGroupEvent.update({
          where: { id: event.id },
          data: { occurredAt: new Date() },
        }),
      ).rejects.toThrow(/append-only/);
      await expect(t.prisma.attemptGroupEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/);
    });

    it("023/FR-020 o evento tem motivo e nenhum autor só quando é do sistema, e muda sempre de pessoa", async () => {
      const work = await groupWork(3);
      await present(work, a, b);
      const attemptId = await attemptOf(work, a, [b]);
      const event = (data: Record<string, unknown>) =>
        t.prisma.attemptGroupEvent.create({
          data: {
            attemptId,
            fromUserId: b.id,
            toUserId: a.id,
            occurredAt: new Date(),
            kind: "EDITING_RETURNED",
            ...data,
          },
        });
      await expect(event({ actorUserId: b.id })).resolves.toBeTruthy();
      await expect(event({ actorUserId: b.id, reason: "PAUSED" })).rejects.toThrow(/reason_chk/);
      await expect(event({ kind: "EDITING_RESET", reason: "PAUSED" })).resolves.toBeTruthy();
      await expect(event({ kind: "EDITING_RESET", actorUserId: a.id, reason: "PAUSED" })).rejects.toThrow(/reason_chk/);
      await expect(event({ kind: "EDITING_RESET" })).rejects.toThrow(/reason_chk/);
      await expect(event({ kind: "LEADER_CHANGED", reason: "PAUSED" })).rejects.toThrow(/reason_chk/);
      await expect(event({ kind: "LEADER_CHANGED", reason: "ACCESS_LOST" })).resolves.toBeTruthy();
      await expect(event({ actorUserId: b.id, toUserId: b.id })).rejects.toThrow(/change_chk/);
      await expect(event({ actorUserId: c.id })).rejects.toThrow(/Foreign key|foreign key/);
    });
  });

  describe("quem escreve e quem entrega (research U8)", () => {
    it("023/FR-012 numa tentativa de grupo só o editor grava resposta", async () => {
      const work = await groupWork(3);
      await present(work, a, b);
      const attemptId = await attemptOf(work, a, [b]);
      await expect(save(work, attemptId, b)).rejects.toThrow(/is not the editor/);
      await expect(save(work, attemptId, a)).resolves.toBeTruthy();
      await setEditor(attemptId, b);
      await expect(save(work, attemptId, a, 1)).rejects.toThrow(/is not the editor/);
      await expect(save(work, attemptId, b, 1)).resolves.toMatchObject({
        savedByUserId: b.id,
        revision: 2,
      });
    });

    it("023/FR-018 numa tentativa de grupo só o líder entrega", async () => {
      const work = await groupWork(3);
      await present(work, a, b);
      const attemptId = await attemptOf(work, a, [b]);
      await expect(submit(work, attemptId, a, b)).rejects.toThrow(/is not the leader/);
      expect(await t.prisma.activitySubmission.count({ where: { attemptId } })).toBe(0);
      await expect(submit(work, attemptId, a, a)).resolves.toMatchObject({
        submittedByUserId: a.id,
      });
    });

    it("023/FR-018 quem entrega é um participante, existe só quando um aluno entregou, e nunca muda", async () => {
      const work = await createActivity(t, schoolClass);
      const { attemptId } = await createAttemptRow(t, work.activity.id, a.id);
      await expect(submit(work, attemptId, a, b)).rejects.toThrow(/Foreign key|foreign key/);
      await t.prisma.activityAttempt.update({
        where: { id: attemptId },
        data: { status: "SUBMITTED" },
      });
      await expect(
        t.prisma.activitySubmission.create({
          data: {
            attemptId,
            activityId: work.activity.id,
            studentUserId: a.id,
            submittedAt: new Date(),
            late: false,
            blankCount: 0,
            grade: "0.00",
            gradePartial: true,
          },
        }),
      ).rejects.toThrow(/submitted_by_chk/);
      const submission = await t.prisma.activitySubmission.create({
        data: {
          attemptId,
          activityId: work.activity.id,
          studentUserId: a.id,
          submittedByUserId: a.id,
          submittedAt: new Date(),
          late: false,
          blankCount: 0,
          grade: "0.00",
          gradePartial: true,
        },
      });
      await expect(
        t.prisma.activitySubmission.update({
          where: { id: submission.id },
          data: { submittedByUserId: null, acceptedById: teacherId },
        }),
      ).rejects.toThrow(/immutable/);

      const accepted = await createActivity(t, schoolClass);
      const { attemptId: acceptedAttempt } = await createAttemptRow(t, accepted.activity.id, a.id);
      await expect(submit(accepted, acceptedAttempt, a, null)).resolves.toMatchObject({
        submittedByUserId: null,
        acceptedById: teacherId,
      });
    });
  });

  describe("pausas por quem escreve (research U10)", () => {
    it("023/FR-023 a pausa aberta de B recusa a resposta salva por B e aceita a salva por A na mesma tentativa", async () => {
      const work = await groupWork(3);
      await present(work, a, b);
      const attemptId = await attemptOf(work, a, [b]);
      await setEditor(attemptId, b);
      await pause(work, attemptId, b);
      await expect(save(work, attemptId, b)).rejects.toThrow(/is paused/);
      await setEditor(attemptId, a);
      await expect(save(work, attemptId, a)).resolves.toMatchObject({
        savedByUserId: a.id,
      });
      // Each participant has their own open pause; the same student never two.
      await expect(pause(work, attemptId, a)).resolves.toBeTruthy();
      await expect(pause(work, attemptId, b)).rejects.toThrow(/one_open|Unique constraint/);
    });

    it("023/FR-023 a pausa de um integrante não recusa a entrega do líder, nem o evento, a ajuda ou a execução dos outros", async () => {
      const work = await groupWork(3);
      await present(work, a, b);
      const attemptId = await attemptOf(work, a, [b]);
      await pause(work, attemptId, b);
      const ids = { attemptId, activityId: work.activity.id };
      await expect(
        t.prisma.attemptIntegrityEvent.create({
          data: {
            ...ids,
            studentUserId: b.id,
            clientEventId: randomUUID(),
            type: "SCREEN_LEFT",
            recordedAt: new Date(),
          },
        }),
      ).rejects.toThrow(/is paused/);
      await expect(
        t.prisma.attemptIntegrityEvent.create({
          data: {
            ...ids,
            studentUserId: a.id,
            clientEventId: randomUUID(),
            type: "SCREEN_LEFT",
            recordedAt: new Date(),
          },
        }),
      ).resolves.toBeTruthy();
      await expect(run(work, attemptId, b)).rejects.toThrow(/is paused/);
      await expect(run(work, attemptId, a)).resolves.toBeTruthy();
      await expect(help(work, attemptId, b)).rejects.toThrow(/is paused/);
      await expect(submit(work, attemptId, a, a)).resolves.toMatchObject({
        submittedByUserId: a.id,
      });
    });

    it("023/FR-023 numa tentativa individual a pausa do dono recusa tudo, como na 016", async () => {
      const work = await createActivity(t, schoolClass, {
        releaseMode: "PRESENT_ONLY",
      });
      await present(work, a);
      const attemptId = await attemptOf(work, a);
      await pause(work, attemptId, a);
      await expect(save(work, attemptId, a)).rejects.toThrow(/is paused/);
      await expect(submit(work, attemptId, a, a)).rejects.toThrow(/is paused/);
    });
  });

  /** A QUEUED run on the work's CODE question by `who`. */
  const run = (activity: CreatedActivity, attemptId: string, who: TestUser) => {
    const createdAt = new Date();
    return t.prisma.codeRun.create({
      data: {
        activityId: activity.activity.id,
        questionId: activity.questionIds[1]!,
        attemptId,
        studentUserId: who.id,
        execution: "python",
        sourceCode: "print(int(input()) * 2)",
        publicCaseCount: 1,
        createdAt,
        deadlineAt: new Date(createdAt.getTime() + MINUTE),
      },
    });
  };

  const help = (activity: CreatedActivity, attemptId: string, who: TestUser) =>
    t.prisma.workHelpRequest.create({
      data: {
        attemptId,
        activityId: activity.activity.id,
        studentUserId: who.id,
        questionId: activity.questionIds[1]!,
        idempotencyKey: randomUUID(),
        question: "Como começo?",
        requestedAt: new Date(),
      },
    });

  describe("fatos por aluno apontam para o participante (research U4)", () => {
    it("023/FR-021 evento, ajuda, pausa e execução de quem não participa da tentativa são recusados", async () => {
      const work = await groupWork(3);
      await present(work, a, b, c);
      const attemptId = await attemptOf(work, a, [b]);
      const ids = { attemptId, activityId: work.activity.id };
      const fk = /Foreign key|foreign key/;
      await expect(
        t.prisma.attemptIntegrityEvent.create({
          data: {
            ...ids,
            studentUserId: c.id,
            clientEventId: randomUUID(),
            type: "SCREEN_LEFT",
            recordedAt: new Date(),
          },
        }),
      ).rejects.toThrow(fk);
      await expect(help(work, attemptId, c)).rejects.toThrow(fk);
      await expect(pause(work, attemptId, c)).rejects.toThrow(fk);
      await expect(run(work, attemptId, c)).rejects.toThrow(fk);
      // A member's are accepted: each fact is about the student who took part.
      await expect(
        t.prisma.attemptIntegrityEvent.create({
          data: {
            ...ids,
            studentUserId: b.id,
            clientEventId: randomUUID(),
            type: "SCREEN_LEFT",
            recordedAt: new Date(),
          },
        }),
      ).resolves.toBeTruthy();
      await expect(pause(work, attemptId, b)).resolves.toBeTruthy();
    });

    it("023/FR-025 a presença de um integrante não é desmarcada depois que ele entrou no grupo", async () => {
      const work = await groupWork(3);
      await present(work, a, b, c);
      await attemptOf(work, a, [b]);
      const presence = (student: TestUser) => ({
        activityId_studentUserId: {
          activityId: work.activity.id,
          studentUserId: student.id,
        },
      });
      await expect(t.prisma.activityAttendance.delete({ where: presence(b) })).rejects.toThrow(/the attendance stays/);
      await expect(t.prisma.activityAttendance.delete({ where: presence(c) })).resolves.toBeTruthy();
    });
  });
});

/**
 * 023 research U3, U4, U8: the migration gives every existing attempt its owner's participation, fills who
 * saved and who submitted, logs each answer's current revision, and leaves no 012–021 row invalid (the moved
 * FKs and the new CHECK are validated against the copied rows). The migrations run in a schema of their own:
 * up to 022, then the 012–021 rows the public schema holds (written through the factories) are copied in
 * with the triggers off, then 023 — through one `pg` connection.
 */
describe("023/FR-003 migração das tentativas de 012–021", () => {
  const MIGRATIONS_DIR = join(API_ROOT, "prisma/migrations");
  const GROUP_WORK_MIGRATION = "20261030120000_group_work";
  const SCHEMA = "migracao_023_test";
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");

  let t: TestApp;
  let db: Client;
  const query = async <T extends object = Record<string, unknown>>(sql: string, values: unknown[] = []) => (await db.query(sql, values)).rows as T[];
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    expect(migrations).toContain(GROUP_WORK_MIGRATION);
    t = await createTestApp();
    await resetDb(t.prisma);
    await seedOlderRows();
    db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.query(`CREATE SCHEMA ${SCHEMA}`);
    await db.query(`SET search_path TO ${SCHEMA}`);
    for (const name of migrations.filter((migration) => migration < GROUP_WORK_MIGRATION)) await db.query(migrationSql(name));
    await copyPublicRows();
    await db.query(migrationSql(GROUP_WORK_MIGRATION));
  }, 180_000);

  afterAll(async () => {
    await db?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db?.end();
    await resetDb(t.prisma);
    await t.close();
  });

  /** Attempts of every kind with an answer, a submission, an event, a help, a pause and a run. */
  async function seedOlderRows(): Promise<void> {
    const teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    const { schoolClass, students } = await createClassWithStudents(t, teacherId, { students: 3 });
    const [a, b, c] = students as [TestUser, TestUser, TestUser];
    const work = await createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      codeExecutionAllowed: true,
      questions: [{ type: "MULTIPLE_CHOICE" }, { type: "CODE", languageKey: "python", testCases: PUBLIC_CASE }],
    });
    await t.prisma.activityAttendance.createMany({
      data: [a, b, c].map((student) => ({
        activityId: work.activity.id,
        studentUserId: student.id,
        classId: schoolClass.id,
        markedAt: new Date(),
        markedById: teacherId,
      })),
    });
    const answer = (attemptId: string, by: TestUser) =>
      t.prisma.activityAnswer.create({
        data: {
          attemptId,
          activityId: work.activity.id,
          questionId: work.questionIds[0]!,
          questionType: "MULTIPLE_CHOICE",
          alternativeId: work.alternativeIds[0]![0]!,
          revision: 3,
          savedAt: new Date(),
          savedByUserId: by.id,
        },
      });
    const facts = { activityId: work.activity.id };

    // In progress: an answer, an event, a released pause, a help and a queued run.
    const { attemptId: open } = await createAttemptRow(t, work.activity.id, a.id);
    await answer(open, a);
    await t.prisma.attemptIntegrityEvent.create({
      data: {
        ...facts,
        attemptId: open,
        studentUserId: a.id,
        clientEventId: randomUUID(),
        type: "SCREEN_LEFT",
        recordedAt: new Date(),
      },
    });
    const paused = await t.prisma.attemptPause.create({
      data: {
        ...facts,
        attemptId: open,
        studentUserId: a.id,
        initiatedBy: "STUDENT",
        reason: "WATER",
        startedAt: new Date(),
        startedById: a.id,
      },
    });
    await t.prisma.attemptPause.update({
      where: { id: paused.id },
      data: { releasedAt: new Date(), releasedById: teacherId },
    });
    await t.prisma.workHelpRequest.create({
      data: {
        ...facts,
        attemptId: open,
        studentUserId: a.id,
        questionId: work.questionIds[1]!,
        idempotencyKey: randomUUID(),
        question: "Como?",
        requestedAt: new Date(),
      },
    });
    await t.prisma.codeRun.create({
      data: {
        ...facts,
        attemptId: open,
        studentUserId: a.id,
        questionId: work.questionIds[1]!,
        execution: "python",
        sourceCode: "print(1)",
        publicCaseCount: 1,
        createdAt: new Date(),
        deadlineAt: new Date(Date.now() + MINUTE),
      },
    });
    // Submitted by the student, and accepted by the teacher.
    const { attemptId: submitted } = await createAttemptRow(t, work.activity.id, b.id);
    await answer(submitted, b);
    await t.prisma.activityAttempt.update({
      where: { id: submitted },
      data: { status: "SUBMITTED" },
    });
    await t.prisma.activitySubmission.create({
      data: {
        ...facts,
        attemptId: submitted,
        studentUserId: b.id,
        submittedByUserId: b.id,
        submittedAt: new Date(),
        late: false,
        blankCount: 1,
        grade: "0.00",
        gradePartial: true,
      },
    });
    const { attemptId: accepted } = await createAttemptRow(t, work.activity.id, c.id, { submission: { acceptedById: teacherId } });
    // An exam ended by the time, and two practice attempts of an exercise.
    const exam = await createActivity(t, schoolClass, { type: "EXAM" });
    await t.prisma.activityAttendance.create({
      data: {
        activityId: exam.activity.id,
        studentUserId: a.id,
        classId: schoolClass.id,
        markedAt: new Date(),
        markedById: teacherId,
      },
    });
    const { attemptId: timedOut } = await createAttemptRow(t, exam.activity.id, a.id);
    await t.prisma.activityAttempt.update({
      where: { id: timedOut },
      data: { status: "SUBMITTED" },
    });
    await t.prisma.activitySubmission.create({
      data: {
        activityId: exam.activity.id,
        attemptId: timedOut,
        studentUserId: a.id,
        submittedAt: new Date(),
        late: false,
        blankCount: 1,
        grade: "0.00",
        gradePartial: false,
        endReason: "TIME_EXPIRED",
      },
    });
    const exercise = await createActivity(t, schoolClass, { type: "EXERCISE" });
    const { attemptId: practice1 } = await createAttemptRow(t, exercise.activity.id, b.id, { completedAt: new Date() });
    const { attemptId: practice2 } = await createAttemptRow(t, exercise.activity.id, b.id, { number: 2 });
    Object.assign(ids, {
      a: a.id,
      b: b.id,
      c: c.id,
      open,
      submitted,
      accepted,
      timedOut,
      practice1,
      practice2,
    });
  }

  /** Every table the migrations left empty gets the public rows, in the columns both have, enums cast by name. */
  async function copyPublicRows(): Promise<void> {
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [SCHEMA],
    );
    await db.query("BEGIN");
    await db.query("SET LOCAL session_replication_role = replica");
    for (const { table_name: table } of tables) {
      const columns = await query<{
        column_name: string;
        data_type: string;
        udt_name: string;
      }>(
        `SELECT s.column_name, s.data_type, s.udt_name FROM information_schema.columns s
         JOIN information_schema.columns p ON p.table_schema = 'public' AND p.table_name = s.table_name AND p.column_name = s.column_name
         WHERE s.table_schema = $1 AND s.table_name = $2 ORDER BY s.ordinal_position`,
        [SCHEMA, table],
      );
      // The tables the migrations seed (roles, permissions, languages) keep their own rows.
      const seeded = await query(`SELECT 1 FROM ${SCHEMA}."${table}" LIMIT 1`);
      if (columns.length === 0 || seeded.length > 0) continue;
      const names = columns.map((column) => `"${column.column_name}"`).join(", ");
      const values = columns
        .map((column) => (column.data_type === "USER-DEFINED" ? `"${column.column_name}"::text::${SCHEMA}."${column.udt_name}"` : `"${column.column_name}"`))
        .join(", ");
      await db.query(`INSERT INTO ${SCHEMA}."${table}" (${names}) SELECT ${values} FROM public."${table}"`);
    }
    await db.query("COMMIT");
  }

  it("023/FR-003 uma participação do dono por tentativa existente, com o número dela", async () => {
    const rows = await query<{
      attempt_id: string;
      student_user_id: string;
      attempt_number: number;
      added_by_user_id: string | null;
    }>(`SELECT attempt_id, student_user_id, attempt_number, added_by_user_id FROM attempt_participants ORDER BY attempt_id`);
    const attempts = await query<{
      id: string;
      student_user_id: string;
      number: number;
    }>(`SELECT id, student_user_id, number FROM activity_attempts ORDER BY id`);
    expect(attempts).toHaveLength(6);
    expect(rows).toEqual(
      attempts.map((attempt) => ({
        attempt_id: attempt.id,
        student_user_id: attempt.student_user_id,
        attempt_number: attempt.number,
        added_by_user_id: null,
      })),
    );
    expect(rows.find((row) => row.attempt_id === ids.practice2)).toMatchObject({
      attempt_number: 2,
    });
    expect(await query(`SELECT 1 FROM attempt_groups`)).toEqual([]);
  });

  it("023/FR-015 quem salvou é o dono; quem entregou, o aluno da entrega própria; o aceite e o fim pelo tempo ficam sem aluno", async () => {
    const answers = await query<{
      attempt_id: string;
      saved_by_user_id: string;
    }>(`SELECT attempt_id, saved_by_user_id FROM activity_answers ORDER BY attempt_id`);
    expect(Object.fromEntries(answers.map((row) => [row.attempt_id, row.saved_by_user_id]))).toEqual({ [ids.open!]: ids.a, [ids.submitted!]: ids.b });
    const submissions = await query<{
      attempt_id: string;
      submitted_by_user_id: string | null;
    }>(`SELECT attempt_id, submitted_by_user_id FROM activity_submissions`);
    expect(Object.fromEntries(submissions.map((row) => [row.attempt_id, row.submitted_by_user_id]))).toEqual({
      [ids.submitted!]: ids.b,
      [ids.accepted!]: null,
      [ids.timedOut!]: null,
    });
    const saves = await query<{
      attempt_id: string;
      revision: number;
      student_user_id: string;
    }>(`SELECT attempt_id, revision, student_user_id FROM activity_answer_saves ORDER BY attempt_id`);
    expect(saves).toEqual(
      [
        { attempt_id: ids.open, revision: 3, student_user_id: ids.a },
        { attempt_id: ids.submitted, revision: 3, student_user_id: ids.b },
      ].sort((x, y) => x.attempt_id!.localeCompare(y.attempt_id!)),
    );
  });

  it("023/FR-021 os fatos por aluno de 015–021 continuam válidos e passam a apontar para o participante", async () => {
    for (const table of ["attempt_integrity_events", "work_help_requests", "attempt_pauses", "code_runs"]) {
      const rows = await query<{ orphan: boolean }>(
        `SELECT NOT EXISTS (SELECT 1 FROM attempt_participants p WHERE p.attempt_id = f.attempt_id AND p.student_user_id = f.student_user_id) AS orphan FROM ${table} f`,
      );
      expect(rows.length, table).toBeGreaterThan(0);
      expect(
        rows.every((row) => !row.orphan),
        table,
      ).toBe(true);
      const target = await query<{ target: string }>(
        `SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE conname = $1 AND connamespace = $2::regnamespace`,
        [`${table}_attempt_id_activity_id_student_${table === "attempt_integrity_events" ? "us" : "user_id"}_fkey`, SCHEMA],
      );
      expect(
        target.map((row) => row.target.replace(`${SCHEMA}.`, "")),
        table,
      ).toEqual(["attempt_participants"]);
    }
  });
});
