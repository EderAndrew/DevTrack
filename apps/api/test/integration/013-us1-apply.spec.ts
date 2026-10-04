import { randomUUID } from "node:crypto";
import type { StudentActivitySummary, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyExercises, applyWork, createClassWithStudents, FAR_DEADLINE } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 013/US1 — the teacher applies 1–10 APPROVED exercises to their class with no grade, deadline or
 * late policy: each exercise is worth the fixed points of its difficulty (15/30/60), copied into the
 * snapshot, and the activity shows the possible total (013/FR-001…FR-004). A work is applied as in
 * 012. Acknowledging the taught scope is out of the way here (`acknowledgeOutOfScope: true`); the
 * scope check itself is 012/FR-005a.
 */

const START = "2026-10-01T12:00:00.000Z";
const iso = (clock: FixedClock, offset: number) => new Date(clock.now().getTime() + offset).toISOString();

describe("013/US1 professor aplica exercícios sem nota e sem prazo", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let students: TestUser[];
  let client: ReturnType<typeof api>;
  let syllabus: ConfirmedSyllabus;
  let classId: string;
  let work: WorkFixture;

  const base = () => `/api/classes/${classId}/activities`;
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const acknowledged = { acknowledgeOutOfScope: true };

  /** One exercise of each level, in the order Básico, Intermediário, Avançado. */
  const threeLevels = async () => [
    await createExercise(t, teacher.id, { difficulty: "BASIC" }),
    await createExercise(t, teacher.id, { type: "OPEN_ANSWER", difficulty: "INTERMEDIATE" }),
    await createExercise(t, teacher.id, { type: "CODE", difficulty: "ADVANCED" }),
  ];

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    classId = created.schoolClass.id;
    students = created.students;
    work = await createWork(t, teacher.id, { syllabus, status: "APPROVED", totalGrade: "1.00" });
  });

  it("013/US1-1 013/FR-001 013/FR-003 Básico + Intermediário + Avançado: 15, 30 e 60 pontos, total 105, sem nota, prazo nem regra", async () => {
    const exercises = await threeLevels();
    const res = await applyExercises(client, classId, exercises.map((exercise) => exercise.id), acknowledged);
    expect(res.status).toBe(201);
    const activity = res.body as TeacherActivity;
    expect(activity).toMatchObject({
      type: "EXERCISE",
      status: "ACTIVE",
      phase: "PUBLISHED",
      totalGrade: null,
      deadline: null,
      latePolicy: null,
      resultReleasedAt: null,
      possiblePoints: 105,
      exerciseCounts: { completed: 0, pendingMarks: 0 },
    });
    expect(activity.questions.map((q) => [q.difficulty, q.points, q.value])).toEqual([
      ["BASIC", 15, null],
      ["INTERMEDIATE", 30, null],
      ["ADVANCED", 60, null],
    ]);
    // The roster of an EXERCISE counts points, never a grade.
    expect(activity.roster.map((entry) => [entry.status, entry.grade, entry.pointsEarned, entry.pendingMarks])).toEqual([
      ["NOT_STARTED", null, 0, 0],
      ["NOT_STARTED", null, 0, 0],
    ]);

    const [published] = await events("activity.published");
    expect(published!.metadata).toMatchObject({ type: "EXERCISE", sourceExerciseCount: 3, questionCount: 3, possiblePoints: 105 });
    expect(published!.metadata).not.toHaveProperty("totalCents");
    expect(published!.metadata).not.toHaveProperty("latePolicy");

    // The list shows the same: no deadline, the possible points.
    const list = await client.get(base());
    expect(list.body.items).toEqual([
      expect.objectContaining({ id: activity.id, deadline: null, latePolicy: null, totalGrade: null, possiblePoints: 105 }),
    ]);

    // The students see it, with points instead of a deadline or a grade.
    for (const student of students) {
      const mine = await api(t, { cookie: await loginAs(t, student) }).get("/api/me/activities");
      expect(mine.status).toBe(200);
      const item = (mine.body.items as StudentActivitySummary[]).find((entry) => entry.id === activity.id);
      expect(item).toMatchObject({
        type: "EXERCISE",
        deadline: null,
        latePolicy: null,
        totalGrade: null,
        result: null,
        canAnswer: true,
        points: { possible: 105, earned: 0, awaitingCorrection: false },
      });
    }
  });

  it("013/US1-2 013/FR-001 exercícios com nota total, prazo ou regra de atraso → 400, nada criado", async () => {
    const exercises = await threeLevels();
    const ids = exercises.map((exercise) => exercise.id);
    for (const field of [
      { totalGrade: "10.00" },
      { deadline: FAR_DEADLINE },
      { latePolicy: "ACCEPT_MARKED" as const },
      { deadline: FAR_DEADLINE, latePolicy: "REJECT" as const },
    ]) {
      const refused = await applyExercises(client, classId, ids, { ...acknowledged, ...field });
      expect([refused.status, refused.body.code], JSON.stringify(field)).toEqual([400, "VALIDATION_ERROR"]);
    }
    // Points come from the difficulty, never from the request.
    const withPoints = await client.post(base(), {
      idempotencyKey: randomUUID(),
      source: { type: "EXERCISE", exerciseIds: ids, points: [15, 30, 60] },
      title: "Lista",
      publishAt: null,
      acknowledgeOutOfScope: true,
    });
    expect(withPoints.status).toBe(400);
    expect(await t.prisma.classActivity.count()).toBe(0);
    expect(await events("activity.published")).toHaveLength(0);
  });

  it("013/US1-3 013/FR-002 mudar o nível do exercício no banco não muda os pontos da atividade (snapshot)", async () => {
    const exercises = await threeLevels();
    const activity = (await applyExercises(client, classId, exercises.map((exercise) => exercise.id), acknowledged)).body as TeacherActivity;

    await t.prisma.exercise.update({ where: { id: exercises[0]!.id }, data: { difficulty: "ADVANCED" } });
    await t.prisma.exercise.update({ where: { id: exercises[2]!.id }, data: { difficulty: "BASIC" } });

    const again = (await client.get(`${base()}/${activity.id}`)).body as TeacherActivity;
    expect(again.questions.map((q) => [q.difficulty, q.points])).toEqual([
      ["BASIC", 15],
      ["INTERMEDIATE", 30],
      ["ADVANCED", 60],
    ]);
    expect(again.possiblePoints).toBe(105);

    // A new application copies the bank as it is now.
    const later = (await applyExercises(client, classId, exercises.map((exercise) => exercise.id), acknowledged)).body as TeacherActivity;
    expect(later.questions.map((q) => q.points)).toEqual([60, 30, 15]);
  });

  it("013/US1-4 Trabalho continua como na 012: prazo e regra de atraso obrigatórios, nota do trabalho", async () => {
    const applied = await applyWork(client, classId, work.id, { ...acknowledged, deadline: iso(clock, 7 * DAY), latePolicy: "ACCEPT_MARKED" });
    expect(applied.status).toBe(201);
    expect(applied.body).toMatchObject({
      type: "ASSIGNMENT",
      totalGrade: "1.00",
      latePolicy: "ACCEPT_MARKED",
      possiblePoints: null,
      exerciseCounts: null,
    });
    expect((applied.body as TeacherActivity).questions.every((q) => q.value !== null && q.points === null && q.difficulty === null)).toBe(true);
    expect((await events("activity.published"))[0]!.metadata).toMatchObject({ type: "ASSIGNMENT", totalCents: 100, latePolicy: "ACCEPT_MARKED" });

    for (const missing of [{ deadline: undefined }, { latePolicy: undefined }]) {
      const refused = await applyWork(client, classId, work.id, { ...acknowledged, ...missing });
      expect([refused.status, refused.body.code], JSON.stringify(Object.keys(missing))).toEqual([400, "VALIDATION_ERROR"]);
    }
    expect((await applyWork(client, classId, work.id, { ...acknowledged, totalGrade: "5.00" })).status).toBe(400);
  });

  it("013/US1-5 013/FR-004 edição de Exercício: título, instruções e publicação ainda não atingida; nunca exercícios, pontos, prazo ou regra", async () => {
    const exercises = await threeLevels();
    const scheduled = (
      await applyExercises(client, classId, exercises.map((exercise) => exercise.id), { ...acknowledged, publishAt: iso(clock, DAY) })
    ).body as TeacherActivity;
    expect(scheduled.phase).toBe("SCHEDULED");

    const edited = await client.patch(`${base()}/${scheduled.id}`, {
      version: 1,
      title: "Lista revisada",
      instructions: "Pratique à vontade.",
      publishAt: iso(clock, 2 * DAY),
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      title: "Lista revisada",
      instructions: "Pratique à vontade.",
      publishAt: iso(clock, 2 * DAY),
      deadline: null,
      latePolicy: null,
      possiblePoints: 105,
      version: 2,
    });
    expect((await events("activity.updated"))[0]!.metadata).toEqual({ classId, fields: ["instructions", "publishAt", "title"] });

    // 013/FR-004: neither a deadline nor a late policy, and never the exercises or their points.
    for (const field of [
      { deadline: iso(clock, 5 * DAY) },
      { latePolicy: "REJECT" },
      { exerciseIds: [exercises[0]!.id] },
      { points: 100 },
      { possiblePoints: 200 },
      { totalGrade: "10.00" },
    ]) {
      const refused = await client.patch(`${base()}/${scheduled.id}`, { version: 2, ...field });
      expect([refused.status, refused.body.code], JSON.stringify(field)).toEqual([400, "VALIDATION_ERROR"]);
    }
    expect(await events("activity.updated")).toHaveLength(1);

    // Once published, the publication date no longer moves (012/FR-004).
    clock.advance(2 * DAY);
    const late = await client.patch(`${base()}/${scheduled.id}`, { version: 2, publishAt: iso(clock, DAY) });
    expect([late.status, late.body.code]).toEqual([422, "ALREADY_PUBLISHED"]);
    expect((await client.patch(`${base()}/${scheduled.id}`, { version: 2, title: "Lista final" })).body).toMatchObject({
      title: "Lista final",
      version: 3,
      possiblePoints: 105,
    });
  });

  it("013/FR-001 de 1 a 10 exercícios APPROVED do próprio banco; 11, repetidos, DRAFT ou de outro professor → recusa", async () => {
    const ten = [];
    for (let index = 0; index < 10; index += 1) ten.push(await createExercise(t, teacher.id, { difficulty: "INTERMEDIATE" }));
    const full = await applyExercises(client, classId, ten.map((exercise) => exercise.id), acknowledged);
    expect([full.status, full.body.possiblePoints]).toEqual([201, 300]);

    const eleventh = await createExercise(t, teacher.id);
    expect((await applyExercises(client, classId, [...ten.map((exercise) => exercise.id), eleventh.id], acknowledged)).status).toBe(400);
    expect((await applyExercises(client, classId, [], acknowledged)).status).toBe(400);
    expect((await applyExercises(client, classId, [eleventh.id, eleventh.id], acknowledged)).status).toBe(400);

    const draft = await createExercise(t, teacher.id, { status: "DRAFT" });
    const draftRes = await applyExercises(client, classId, [eleventh.id, draft.id], acknowledged);
    expect([draftRes.status, draftRes.body.code]).toEqual([422, "SOURCE_NOT_APPROVED"]);

    const stranger = await createUser(t, { roles: ["TEACHER"] });
    const strangers = await createExercise(t, stranger.id);
    expect((await applyExercises(client, classId, [eleventh.id, strangers.id], acknowledged)).status).toBe(404);
  });

  it("013/FR-003 013/FR-004 encerrar e cancelar um Exercício seguem a 012; não há resultado a liberar", async () => {
    const exercises = await threeLevels();
    const activity = (await applyExercises(client, classId, exercises.map((exercise) => exercise.id), acknowledged)).body as TeacherActivity;

    const release = await client.post(`${base()}/${activity.id}/release`, {});
    expect([release.status, release.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);

    const closed = await client.post(`${base()}/${activity.id}/close`, {});
    expect([closed.status, closed.body.status, closed.body.possiblePoints]).toEqual([200, "CLOSED", 105]);
    const cancelled = await client.post(`${base()}/${activity.id}/cancel`, {});
    expect([cancelled.status, cancelled.body.status]).toEqual([200, "CANCELLED"]);
  });
});
