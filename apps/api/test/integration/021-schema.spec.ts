import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createAttemptRow, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MINUTE = 60_000;
const PUBLIC_CASE = [{ input: "1\n", expectedOutput: "2\n", visibility: "PUBLIC" as const }];

/**
 * 021 data-model.md (research Y1, Y5): the database refuses, by itself, the option on anything but a
 * work, a change of it once a student started, a run on a work without it or on an exam, and a new run
 * while the attempt is paused (constitution V).
 */
describe("021/FR-001 021/FR-002 021/FR-006 regras do Code Runner nos Trabalhos garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let student: TestUser;
  let schoolClass: { id: string; teacherId: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    const created = await createClassWithStudents(t, teacherId, { students: 1 });
    schoolClass = created.schoolClass;
    [student] = created.students as [TestUser];
  });

  /** An ASSIGNMENT with one python CODE question and a PUBLIC case; PRESENT_ONLY so it can be paused. */
  const codeWork = (codeExecutionAllowed: boolean) =>
    createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      codeExecutionAllowed,
      questions: [{ type: "CODE", languageKey: "python", testCases: PUBLIC_CASE }],
    });

  /** An IN_PROGRESS attempt; a PRESENT_ONLY activity (works here, exams) marks the student present first. */
  const attempt = async (activity: CreatedActivity) => {
    if (activity.activity.releaseMode === "PRESENT_ONLY") {
      await t.prisma.activityAttendance.create({
        data: { activityId: activity.activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: new Date(), markedById: teacherId },
      });
    }
    return (await createAttemptRow(t, activity.activity.id, student.id)).attemptId;
  };

  /** A QUEUED run of `attemptId` on the activity's first (CODE) question. */
  const run = (activity: CreatedActivity, attemptId: string) => {
    const createdAt = new Date();
    return t.prisma.codeRun.create({
      data: {
        activityId: activity.activity.id,
        questionId: activity.questionIds[0]!,
        attemptId,
        studentUserId: student.id,
        execution: "python",
        sourceCode: "print(int(input()) * 2)",
        publicCaseCount: 1,
        createdAt,
        deadlineAt: new Date(createdAt.getTime() + MINUTE),
      },
    });
  };

  const pause = (activity: CreatedActivity, attemptId: string) =>
    t.prisma.attemptPause.create({
      data: {
        attemptId,
        activityId: activity.activity.id,
        studentUserId: student.id,
        initiatedBy: "STUDENT",
        reason: "WATER",
        startedAt: new Date(),
        startedById: student.id,
      },
    });
  const release = (pauseId: string) => t.prisma.attemptPause.update({ where: { id: pauseId }, data: { releasedAt: new Date(), releasedById: teacherId } });

  const allowed = (activity: CreatedActivity) =>
    t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.activity.id }, select: { codeExecutionAllowed: true } }).then((row) => row.codeExecutionAllowed);
  const setAllowed = (activity: CreatedActivity, codeExecutionAllowed: boolean) =>
    t.prisma.classActivity.update({ where: { id: activity.activity.id }, data: { codeExecutionAllowed } });

  describe("a opção da atividade (research Y1)", () => {
    it("021/FR-003 padrão false; true só num ASSIGNMENT (CHECK)", async () => {
      const work = await createActivity(t, schoolClass);
      expect(await allowed(work)).toBe(false);
      await expect(setAllowed(work, true)).resolves.toBeTruthy();
      expect(await allowed(work)).toBe(true);

      const exercise = await createActivity(t, schoolClass, { type: "EXERCISE" });
      const exam = await createActivity(t, schoolClass, { type: "EXAM" });
      expect(await allowed(exercise)).toBe(false);
      await expect(setAllowed(exercise, true)).rejects.toThrow(/code_execution_allowed_chk/);
      await expect(setAllowed(exam, true)).rejects.toThrow(/code_execution_allowed_chk/);
    });

    it("021/FR-002 muda só enquanto a atividade não tem tentativa", async () => {
      const work = await codeWork(false);
      await expect(setAllowed(work, true)).resolves.toBeTruthy();
      await expect(setAllowed(work, false)).resolves.toBeTruthy();
      await attempt(work);
      await expect(setAllowed(work, true)).rejects.toThrow(/code execution option of activity .* is fixed/);
      expect(await allowed(work)).toBe(false);
      // Other columns still change after the start (015/016 rules unchanged).
      await expect(t.prisma.classActivity.update({ where: { id: work.activity.id }, data: { title: "Outro título" } })).resolves.toBeTruthy();
    });
  });

  describe("execuções (research Y5)", () => {
    it("021/FR-005 só numa questão CODE de EXERCISE ou de ASSIGNMENT com a opção; nunca de EXAM", async () => {
      const without = await codeWork(false);
      await expect(run(without, await attempt(without))).rejects.toThrow(/not a CODE question of an exercise/);

      const withOption = await codeWork(true);
      await expect(run(withOption, await attempt(withOption))).resolves.toBeTruthy();

      const exam = await createActivity(t, schoolClass, {
        type: "EXAM",
        questions: [{ type: "CODE", languageKey: "python", testCases: PUBLIC_CASE }],
      });
      await expect(run(exam, await attempt(exam))).rejects.toThrow(/not a CODE question of an exercise/);
    });

    it("021/FR-005 EXERCISE segue aceito como na 019", async () => {
      const exercise = await createActivity(t, schoolClass, {
        type: "EXERCISE",
        questions: [{ type: "CODE", languageKey: "python", testCases: PUBLIC_CASE }],
      });
      await expect(run(exercise, await attempt(exercise))).resolves.toBeTruthy();
    });

    it("021/FR-006 nenhuma execução nova com a pausa aberta; liberada, aceita; o worker termina a de uma tentativa pausada", async () => {
      const work = await codeWork(true);
      const attemptId = await attempt(work);
      const open = await pause(work, attemptId);
      await expect(run(work, attemptId)).rejects.toThrow(/is paused/);
      expect(await t.prisma.codeRun.count()).toBe(0);
      await release(open.id);

      const queued = await run(work, attemptId);
      await pause(work, attemptId);
      await expect(
        t.prisma.codeRun.update({
          where: { id: queued.id },
          data: { status: "RUNNING", claimedAt: new Date(), leaseUntil: new Date(Date.now() + 90_000), claimedBy: "worker-1", claimToken: randomUUID() },
        }),
      ).resolves.toBeTruthy();
      await expect(
        t.prisma.codeRun.update({ where: { id: queued.id }, data: { status: "FAILED", failureReason: "INTERRUPTED", finishedAt: new Date() } }),
      ).resolves.toMatchObject({ status: "FAILED" });
    });
  });
});
