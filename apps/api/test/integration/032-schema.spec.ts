import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ExamHoldResolution } from "../../src/generated/prisma/client";
import { endsAt } from "../../src/modules/activities/status/exam-time";
import { createActivity, createAttemptRow, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { API_ROOT } from "../helpers/env";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MINUTE = 60_000;

/**
 * 032 data-model.md, research AP7: the period's end is `deadline` for ASSIGNMENT and EXAM, the start
 * window is gone, and the database refuses by itself what no clock is needed for (constitution V).
 */
describe("032/FR-002 032/FR-015 o período garantido pelo PostgreSQL", () => {
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
    student = created.students[0]!;
  });

  /** An exam with the student present and their IN_PROGRESS attempt. */
  const startedExam = async (options: { publishAt?: Date; deadline?: Date; durationMinutes?: number; startedAt?: Date } = {}) => {
    const exam = await createActivity(t, schoolClass, { type: "EXAM", ...options });
    await t.prisma.activityAttendance.create({
      data: { activityId: exam.activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: new Date(), markedById: teacherId },
    });
    const { attemptId } = await createAttemptRow(t, exam.activity.id, student.id, { startedAt: options.startedAt });
    return { exam, attemptId };
  };
  const held = async (exam: CreatedActivity, attemptId: string) => {
    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      const event = await t.prisma.attemptIntegrityEvent.create({
        data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, clientEventId: randomUUID(), type: "SCREEN_LEFT", recordedAt: new Date() },
      });
      await t.prisma.examOccurrence.create({
        data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, ordinal, kind: "SCREEN_LEFT", firstEventId: event.id, recordedAt: event.recordedAt },
      });
    }
    return t.prisma.examAttemptHold.create({
      data: { attemptId, activityId: exam.activity.id, studentUserId: student.id, occurrenceOrdinal: 4, openedAt: new Date() },
    });
  };
  const resolve = (holdId: string, resolution: ExamHoldResolution) =>
    t.prisma.examAttemptHold.update({ where: { id: holdId }, data: { resolution, resolvedAt: new Date(), resolvedById: teacherId } });

  it("032/FR-001 o término é obrigatório na prova e no trabalho, e nulo no exercício (032/SC-006)", async () => {
    const exam = await createActivity(t, schoolClass, { type: "EXAM" });
    const work = await createActivity(t, schoolClass);
    const exercise = await createActivity(t, schoolClass, { type: "EXERCISE" });
    expect(exam.activity.deadline).not.toBeNull();
    expect(exam.activity.latePolicy).toBeNull();
    expect(work.activity.deadline).not.toBeNull();
    expect(exercise.activity.deadline).toBeNull();
    await expect(t.prisma.classActivity.update({ where: { id: exam.activity.id }, data: { deadline: null } })).rejects.toThrow(/type_fields_chk/);
    await expect(t.prisma.classActivity.update({ where: { id: work.activity.id }, data: { deadline: null } })).rejects.toThrow(/type_fields_chk/);
    await expect(
      t.prisma.classActivity.update({ where: { id: exercise.activity.id }, data: { deadline: new Date(Date.now() + MINUTE) } }),
    ).rejects.toThrow(/type_fields_chk/);
    await expect(t.prisma.classActivity.update({ where: { id: exam.activity.id }, data: { latePolicy: "REJECT" } })).rejects.toThrow(/type_fields_chk/);
  });

  it("032/FR-002 o período da prova tem ao menos a duração", async () => {
    const publishAt = new Date(Date.now() + 60 * MINUTE);
    await expect(createActivity(t, schoolClass, { type: "EXAM", publishAt, deadline: new Date(publishAt.getTime() + 60 * MINUTE) })).resolves.toBeTruthy();
    await expect(
      createActivity(t, schoolClass, { type: "EXAM", publishAt, deadline: new Date(publishAt.getTime() + 59 * MINUTE) }),
    ).rejects.toThrow(/exam_chk/);
    await expect(createActivity(t, schoolClass, { type: "EXAM", publishAt, deadline: publishAt })).rejects.toThrow(/schedule_chk|exam_chk/);
  });

  it("032/FR-005 o limite para iniciar não existe mais", async () => {
    const columns = await t.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'class_activities' AND column_name = 'start_window_minutes'`;
    expect(columns).toEqual([]);
  });

  it("032/FR-012 o término de uma prova com tentativa nunca diminui; sem tentativa, muda livre", async () => {
    const free = await createActivity(t, schoolClass, { type: "EXAM" });
    const earlier = new Date(free.activity.deadline!.getTime() - 60 * MINUTE);
    await expect(t.prisma.classActivity.update({ where: { id: free.activity.id }, data: { deadline: earlier } })).resolves.toBeTruthy();

    const { exam } = await startedExam();
    const end = exam.activity.deadline!;
    await expect(
      t.prisma.classActivity.update({ where: { id: exam.activity.id }, data: { deadline: new Date(end.getTime() - MINUTE) } }),
    ).rejects.toThrow(/only moves later/);
    await expect(
      t.prisma.classActivity.update({ where: { id: exam.activity.id }, data: { deadline: new Date(end.getTime() + 30 * MINUTE) } }),
    ).resolves.toBeTruthy();

    // A work's end is not the trigger's: it moves both ways with attempts (012).
    const work = await createActivity(t, schoolClass);
    await createAttemptRow(t, work.activity.id, student.id);
    await expect(
      t.prisma.classActivity.update({ where: { id: work.activity.id }, data: { deadline: new Date(work.activity.deadline!.getTime() - MINUTE) } }),
    ).resolves.toBeTruthy();
  });

  it("032/FR-007 devolver a prova é recusado depois do fim do período, mesmo com duração sobrando", async () => {
    // Started 10 minutes ago in a 60-minute exam whose period ended 1 minute ago: 50 minutes of duration left.
    const now = Date.now();
    const cut = await startedExam({
      publishAt: new Date(now - 70 * MINUTE),
      deadline: new Date(now - MINUTE),
      startedAt: new Date(now - 10 * MINUTE),
    });
    const cutHold = await held(cut.exam, cut.attemptId);
    await expect(resolve(cutHold.id, "RETURNED")).rejects.toThrow(/no time left/);
    await expect(resolve(cutHold.id, "NOT_CANCELLED")).resolves.toMatchObject({ resolution: "NOT_CANCELLED" });

    const inTime = await startedExam({ publishAt: new Date(now - 70 * MINUTE), deadline: new Date(now + 30 * MINUTE), startedAt: new Date(now - 10 * MINUTE) });
    const inTimeHold = await held(inTime.exam, inTime.attemptId);
    await expect(resolve(inTimeHold.id, "RETURNED")).resolves.toMatchObject({ resolution: "RETURNED" });
  });

  it("032/US4-1 032/SC-005 a conversão dá a cada prova o fechamento antigo, e nenhuma tentativa muda de fim", async () => {
    // The migration's expression, with literal values: publication + window + duration.
    const migration = readFileSync(resolvePath(API_ROOT, "prisma/migrations/20261127120000_032_activity_period/migration.sql"), "utf8");
    expect(migration).toContain(
      `SET "deadline" = "publish_at" + make_interval(mins => "start_window_minutes"::int + "duration_minutes"::int)`,
    );
    const publish = new Date("2026-11-30T22:10:00.000Z");
    const cases = [
      { window: 0, duration: 1 },
      { window: 15, duration: 60 },
      { window: 60, duration: 120 },
    ];
    for (const { window, duration } of cases) {
      const [row] = await t.prisma.$queryRaw<{ deadline: Date }[]>`
        SELECT ${publish}::timestamptz + make_interval(mins => ${window}::int + ${duration}::int) AS deadline`;
      const oldClosesAt = new Date(publish.getTime() + (window + duration) * MINUTE);
      expect(row!.deadline).toEqual(oldClosesAt);

      // Every attempt the old window allowed (started up to publish + window) keeps start + duration.
      const timing = { publishAt: publish, durationMinutes: duration, deadline: row!.deadline, closedAt: null, cancelledAt: null };
      for (const offset of [0, window / 2, window]) {
        const startedAt = new Date(publish.getTime() + offset * MINUTE);
        expect(endsAt(timing, startedAt), `${window}/${duration}/${offset}`).toEqual(new Date(startedAt.getTime() + duration * MINUTE));
      }
    }
  });
});
