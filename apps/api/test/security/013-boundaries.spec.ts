import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { applyExercises, completeAttempt, createActivity, type CreatedActivity, retryAttempt, startAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const FAR = "2030-12-31T23:59:00.000Z";

/**
 * 013 strict bodies (contracts/http-api.md, plan I. Security): the fields only the server decides —
 * `points`, `result`, `scoring`, `first`, `totalGrade`, `deadline` (and `latePolicy`) — in any 013 body
 * → 400 with nothing written; the teacher's comment at 2 000 and 2 001 characters; 1, 10 and 11 marks;
 * attempt numbers and `afterNumber` outside their ranges.
 */
describe("013 limites e campos do servidor", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let created: CreatedActivity;
  let teacherClient: ReturnType<typeof api>;
  let client: ReturnType<typeof api>;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const state = async () => ({
    activities: await t.prisma.classActivity.findMany({ orderBy: { id: "asc" }, select: { id: true, version: true, title: true, deadline: true, totalGrade: true } }),
    attempts: await t.prisma.activityAttempt.findMany({ orderBy: { id: "asc" }, select: { id: true, number: true, status: true } }),
    answers: await t.prisma.activityAnswer.count(),
    results: await t.prisma.exerciseQuestionResult.findMany({
      orderBy: [{ attemptId: "asc" }, { questionId: "asc" }],
      select: { result: true, points: true, scoring: true, comment: true },
    }),
  });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const student = await createUser(t, { roles: ["STUDENT"] });
    schoolClass = await createClass(t, teacher.id);
    await createEnrollment(t, schoolClass.id, student.id);
    // Ten open answers: the most marks one attempt can take.
    created = await createActivity(t, schoolClass, {
      type: "EXERCISE",
      publishAt: at(-DAY),
      questions: Array.from({ length: 10 }, () => ({ type: "OPEN_ANSWER" as const, difficulty: "BASIC" as const })),
    });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    client = api(t, { cookie: await loginAs(t, student) });
  });

  /** Attempt 1 concluded with every question answered: ten rows waiting for a mark. */
  const concluded = async () => {
    const id = created.activity.id;
    await startAttempt(client, id);
    const res = await completeAttempt(
      client,
      id,
      1,
      created.questionIds.map((questionId) => ({ questionId, answer: text("Resposta"), baseRevision: 0 })),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: id, number: 1 } })).id;
  };

  it("013 campos do servidor (points, result, scoring, first, totalGrade, deadline) em qualquer corpo da 013 → 400 e nada é gravado", async () => {
    const exercise = await createExercise(t, teacher.id, { difficulty: "ADVANCED" });
    const attemptId = await concluded();
    // Attempt 2 open, for the conclusion bodies.
    expect((await retryAttempt(client, created.activity.id, 1)).status).toBe(200);
    const id = created.activity.id;
    const questionId = created.questionIds[0]!;
    const before = await state();

    const applies = [{ totalGrade: "10.00" }, { deadline: FAR }, { latePolicy: "REJECT" as const }];
    for (const extra of applies) {
      const res = await applyExercises(teacherClient, schoolClass.id, [exercise.id], { acknowledgeOutOfScope: true, ...extra });
      expect([JSON.stringify(extra), res.status]).toEqual([JSON.stringify(extra), 400]);
    }
    const base = `/api/classes/${schoolClass.id}/activities`;
    const raw = [
      ["aplicar com pontos", () => teacherClient.post(base, {
        idempotencyKey: crypto.randomUUID(),
        source: { type: "EXERCISE", exerciseIds: [exercise.id], points: 999 },
        title: "x",
        publishAt: null,
        acknowledgeOutOfScope: true,
      })],
      ["editar prazo", () => teacherClient.patch(`${base}/${id}`, { version: created.activity.version, deadline: FAR })],
      ["editar atraso", () => teacherClient.patch(`${base}/${id}`, { version: created.activity.version, latePolicy: "ACCEPT_LATE" })],
      ["editar nota", () => teacherClient.patch(`${base}/${id}`, { version: created.activity.version, totalGrade: "10.00" })],
      ...(["points", "scoring", "first", "result"] as const).map(
        (field) => [`marcar com ${field}`, () => teacherClient.put(`${base}/${id}/attempts/${attemptId}/marks`, { marks: [{ questionId, result: "CORRECT", [field]: field === "points" ? 15 : true }] })] as const,
      ),
      ["marcar com first no corpo", () => teacherClient.put(`${base}/${id}/attempts/${attemptId}/marks`, { marks: [{ questionId, result: "CORRECT" }], first: true })],
      ...(["points", "scoring", "first", "result"] as const).map(
        (field) => [`concluir com ${field}`, () => client.post(`/api/me/activities/${id}/attempts/2/complete`, { answers: [], [field]: field === "points" ? 60 : "CORRECT" })] as const,
      ),
      ["resposta com points", () => client.post(`/api/me/activities/${id}/attempts/2/complete`, { answers: [{ questionId, answer: text("x"), baseRevision: 0, points: 15 }] })],
      ["resposta com result", () => client.post(`/api/me/activities/${id}/attempts/2/complete`, { answers: [{ questionId, answer: text("x"), baseRevision: 0, result: "CORRECT" }] })],
      ["refazer com first", () => client.post(`/api/me/activities/${id}/attempts`, { afterNumber: 2, first: true })],
      ["refazer com points", () => client.post(`/api/me/activities/${id}/attempts`, { afterNumber: 2, points: 60 })],
    ] as const;
    for (const [name, call] of raw) {
      const res = await call();
      expect({ name, status: res.status, code: res.body.code }).toEqual({ name, status: 400, code: "VALIDATION_ERROR" });
    }
    expect(await state()).toEqual(before);
    expect(await t.prisma.classActivity.count()).toBe(1);
  });

  it("013 comentário até 2 000 caracteres; 2 001 → 400; 1 e 10 marcações passam, 11 → 400", async () => {
    const attemptId = await concluded();
    const path = `/api/classes/${schoolClass.id}/activities/${created.activity.id}/attempts/${attemptId}/marks`;
    const [first, ...rest] = created.questionIds;

    const tooLong = await teacherClient.put(path, { marks: [{ questionId: first!, result: "CORRECT", comment: "x".repeat(2_001) }] });
    expect(tooLong.status).toBe(400);
    expect((await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId, questionId: first! } })).result).toBe("PENDING_TEACHER");

    const atLimit = await teacherClient.put(path, { marks: [{ questionId: first!, result: "CORRECT", comment: "x".repeat(2_000) }] });
    expect(atLimit.status, JSON.stringify(atLimit.body)).toBe(200);
    const stored = await t.prisma.exerciseQuestionResult.findFirstOrThrow({ where: { attemptId, questionId: first! } });
    expect([stored.result, stored.points, stored.comment?.length]).toEqual(["CORRECT", 15, 2_000]);

    const ten = await teacherClient.put(path, { marks: created.questionIds.map((questionId) => ({ questionId, result: "WRONG", comment: null })) });
    expect(ten.status).toBe(200);
    const eleven = await teacherClient.put(path, {
      marks: [...created.questionIds.map((questionId) => ({ questionId, result: "CORRECT" })), { questionId: crypto.randomUUID(), result: "CORRECT" }],
    });
    expect(eleven.status).toBe(400);
    const rows = await t.prisma.exerciseQuestionResult.findMany({ where: { attemptId } });
    expect(rows.map((row) => row.result)).toEqual(Array(10).fill("WRONG"));
    expect(rest).toHaveLength(9);
  });

  it("013 número da tentativa e afterNumber fora da faixa → 400; a conclusão aceita até 10 respostas, 11 → 400", async () => {
    const id = created.activity.id;
    await startAttempt(client, id);
    for (const number of ["0", "-1", "1.5", "abc"]) {
      expect([number, (await client.post(`/api/me/activities/${id}/attempts/${number}/complete`, { answers: [] })).status]).toEqual([number, 400]);
      expect([number, (await client.get(`/api/me/activities/${id}/attempts/${number}`)).status]).toEqual([number, 400]);
    }
    for (const afterNumber of [0, -1, 1.5, "1", null]) {
      expect([afterNumber, (await client.post(`/api/me/activities/${id}/attempts`, { afterNumber })).status]).toEqual([afterNumber, 400]);
    }
    const answers = created.questionIds.map((questionId) => ({ questionId, answer: text("x"), baseRevision: 0 }));
    const eleven = await completeAttempt(client, id, 1, [...answers, { questionId: crypto.randomUUID(), answer: text("x"), baseRevision: 0 }]);
    expect(eleven.status).toBe(400);
    expect(await t.prisma.activityAnswer.count()).toBe(0);
    expect((await completeAttempt(client, id, 1, answers)).status).toBe(200);
    expect(await t.prisma.activityAnswer.count()).toBe(10);
  });
});
