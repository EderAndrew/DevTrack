import type { Answer } from "@repo/contracts";
import { StudentActivityPageSchema, StudentActivitySchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import {
  createActivity,
  type CreateActivityOptions,
  type CreatedActivity,
  gradeAttempt,
  releaseResult,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "../helpers/activities";
import { DAY, FixedClock, HOUR } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 012/US6 — the student's history, grade and feedback: completed activities with their submission
 * date, late flag and status; the result only once released with complete grading (never a grade
 * or feedback in any student response before), read once into `activity_result.viewed`; out of
 * context → 404 and `student_access.denied`; the answer key never reaches the student, even after
 * the release.
 */

const START = "2026-10-01T12:00:00.000Z";
const MARKERS = /MARCADOR-(RESPOSTA|RUBRICA|SOLUCAO|PRIVADO|EXPLICACAO)-012/;

describe("012/US6 aluno consulta histórico, nota e feedback", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let teacherClient: ReturnType<typeof api>;
  let client: ReturnType<typeof api>;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /** Multiple choice 0,50 (correct: first) and an open answer 0,50, with the answer key marked. */
  const activityOf = (options: CreateActivityOptions = {}): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 50, correctIndex: 0, explanation: "MARCADOR-EXPLICACAO-012" },
        { type: "OPEN_ANSWER", valueCents: 50, expectedAnswer: "MARCADOR-RESPOSTA-012", rubric: "MARCADOR-RUBRICA-012" },
      ],
      ...options,
    });
  const choice = (alternativeId: string): Answer => ({ kind: "ALTERNATIVE", alternativeId });
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  /** The student submits both answers (MC right); returns the attempt id. */
  const submitted = async (created: CreatedActivity) => {
    const { activity, questionIds, alternativeIds } = created;
    expect((await startAttempt(client, activity.id)).status).toBe(200);
    const res = await submitAttempt(client, activity.id, [
      { questionId: questionIds[0]!, answer: choice(alternativeIds[0]![0]!), baseRevision: 0 },
      { questionId: questionIds[1]!, answer: text("Esconder o estado."), baseRevision: 0 },
    ]);
    expect(res.status).toBe(200);
    return (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: student.id } })).id;
  };
  const gradeOpen = async (created: CreatedActivity, attemptId: string) => {
    const res = await gradeAttempt(teacherClient, schoolClass.id, created.activity.id, attemptId, {
      version: 1,
      decisions: [{ questionId: created.questionIds[1]!, grade: "0.45", feedback: "Faltou a interface pública." }],
      generalFeedback: "Bom trabalho.",
    });
    expect(res.status).toBe(200);
  };
  /** Every student route that can carry the activity. */
  const studentResponses = async (activityId: string) => [
    (await client.get("/api/me/dashboard")).body,
    (await client.get("/api/me/activities")).body,
    (await client.get("/api/me/activities?status=COMPLETED")).body,
    (await client.get(`/api/me/activities/${activityId}`)).body,
    (await client.post(`/api/me/activities/${activityId}/attempt`, {})).body,
    (await submitAttempt(client, activityId)).body,
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
    student = await createUser(t, { roles: ["STUDENT"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    client = api(t, { cookie: await loginAs(t, student) });
    schoolClass = await createClass(t, teacher.id, { name: "POO 2026.2" });
    await createEnrollment(t, schoolClass.id, student.id);
  });

  it("012/FR-031 status=COMPLETED traz as entregues e corrigidas com data, atraso e situação; as demais ficam fora", async () => {
    const onTime = await activityOf({ title: "No prazo", deadline: at(2 * DAY) });
    const late = await activityOf({ title: "Atrasada", deadline: at(HOUR), latePolicy: "ACCEPT_MARKED" });
    await activityOf({ title: "Pendente" });
    await submitted(onTime);
    clock.advance(2 * HOUR);
    await submitted(late);

    const res = await client.get("/api/me/activities?status=COMPLETED");
    expect(res.status).toBe(200);
    const page = StudentActivityPageSchema.parse(res.body);
    expect(page.items.map((item) => [item.title, item.status, item.late, item.submittedAt])).toEqual([
      ["Atrasada", "SUBMITTED", true, at(0).toISOString()],
      ["No prazo", "SUBMITTED", false, at(-2 * HOUR).toISOString()],
    ]);
    expect(page.items.every((item) => item.result === null)).toBe(true);
  });

  it("012/US6-1 012/FR-029 corrigida e não liberada: ENTREGUE, sem result, nota nem feedback em nenhuma rota do aluno", async () => {
    const created = await activityOf();
    await gradeOpen(created, await submitted(created));
    for (const body of await studentResponses(created.activity.id)) {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/"grade"|feedback|Faltou a interface|Bom trabalho|finalGrade/);
    }
    const view = StudentActivitySchema.parse((await client.get(`/api/me/activities/${created.activity.id}`)).body);
    expect([view.status, view.result]).toEqual(["SUBMITTED", null]);
    expect(await events("activity_result.viewed")).toEqual([]);
  });

  it("012/FR-029 liberada mas com questão pendente: ainda ENTREGUE e sem resultado", async () => {
    const created = await activityOf();
    await submitted(created);
    expect((await releaseResult(teacherClient, schoolClass.id, created.activity.id)).status).toBe(200);
    const view = (await client.get(`/api/me/activities/${created.activity.id}`)).body;
    expect([view.status, view.result]).toEqual(["SUBMITTED", null]);
    const item = (await client.get("/api/me/activities?status=COMPLETED")).body.items[0];
    expect([item.status, item.result]).toEqual(["SUBMITTED", null]);
  });

  it("012/US6-2 012/FR-030 liberada e completa: CORRIGIDO com nota total, por questão e feedback; activity_result.viewed uma vez só", async () => {
    const created = await activityOf();
    const attemptId = await submitted(created);
    await gradeOpen(created, attemptId);
    await releaseResult(teacherClient, schoolClass.id, created.activity.id);
    clock.advance(HOUR);

    const view = StudentActivitySchema.parse((await client.get(`/api/me/activities/${created.activity.id}`)).body);
    expect(view.status).toBe("GRADED");
    expect(view.result).toEqual({
      grade: "0.95",
      generalFeedback: "Bom trabalho.",
      questions: [
        { questionId: created.questionIds[0], grade: "0.50", feedback: null },
        { questionId: created.questionIds[1], grade: "0.45", feedback: "Faltou a interface pública." },
      ],
    });
    const item = (await client.get("/api/me/activities?status=COMPLETED")).body.items[0];
    expect([item.status, item.result]).toEqual(["GRADED", { grade: "0.95", hasFeedback: true }]);

    await client.get(`/api/me/activities/${created.activity.id}`);
    const submission = await t.prisma.activitySubmission.findFirstOrThrow({ where: { attemptId } });
    expect(submission.resultViewedAt).toEqual(at(0));
    const [viewed, ...more] = await events("activity_result.viewed");
    expect(more).toEqual([]);
    expect(viewed).toMatchObject({
      actorUserId: student.id,
      targetType: "ACTIVITY_SUBMISSION",
      targetId: submission.id,
      metadata: { activityId: created.activity.id },
    });

    // 012/US6-4 — after the release the answer key is still absent.
    for (const body of await studentResponses(created.activity.id)) {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(MARKERS);
      expect(serialized).not.toMatch(/isCorrect|expectedAnswer|rubric|explanation|gradingStrategy/);
    }
    // The list and the dashboard never count as a view of the result.
    expect(await events("activity_result.viewed")).toHaveLength(1);
  });

  it("012/FR-029 sem notas.proprias.visualizar o result é sempre nulo e nada é auditado", async () => {
    const created = await activityOf();
    await gradeOpen(created, await submitted(created));
    await releaseResult(teacherClient, schoolClass.id, created.activity.id);
    const grant = await t.prisma.rolePermission.findFirstOrThrow({
      where: { role: { key: "STUDENT" }, permission: { key: "notas.proprias.visualizar" } },
    });
    await t.prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } } });
    try {
      const view = (await client.get(`/api/me/activities/${created.activity.id}`)).body;
      expect(view.result).toBeNull();
      expect((await client.get("/api/me/activities?status=COMPLETED")).body.items[0].result).toBeNull();
      expect(await events("activity_result.viewed")).toEqual([]);
    } finally {
      await t.prisma.rolePermission.create({ data: { roleId: grant.roleId, permissionId: grant.permissionId } });
    }
  });

  it("012/US6-3 atividade de turma alheia → 404 e student_access.denied; ids de outro aluno no corpo → 400, sem dado alheio", async () => {
    const otherClass = await createClass(t, teacher.id, { name: "Outra turma" });
    const foreign = await createActivity(t, otherClass, { publishAt: at(-DAY), deadline: at(7 * DAY) });
    const res = await client.get(`/api/me/activities/${foreign.activity.id}`);
    expect(res.status).toBe(404);
    const [denied] = await events("student_access.denied");
    expect(denied).toMatchObject({ actorUserId: student.id, targetId: foreign.activity.id, metadata: { route: "/me/activities/:activityId", reason: "NOT_ENROLLED" } });

    const created = await activityOf();
    const other = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, other.id);
    const otherClient = api(t, { cookie: await loginAs(t, other) });
    await startAttempt(otherClient, created.activity.id);
    await saveAnswers(otherClient, created.activity.id, [{ questionId: created.questionIds[1]!, answer: text("Resposta do colega"), baseRevision: 0 }]);
    const otherAttempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { studentUserId: other.id } });
    await startAttempt(client, created.activity.id);

    const forged = [
      await client.put(`/api/me/activities/${created.activity.id}/attempt/answers`, {
        attemptId: otherAttempt.id,
        answers: [{ questionId: created.questionIds[1]!, answer: text("x"), baseRevision: 0 }],
      }),
      await client.post(`/api/me/activities/${created.activity.id}/attempt/submit`, { submissionId: otherAttempt.id, answers: [] }),
      await client.post(`/api/me/activities/${created.activity.id}/attempt/submit`, { studentUserId: other.id, answers: [] }),
    ];
    expect(forged.map((item) => item.status)).toEqual([400, 400, 400]);
    const mine = (await client.get(`/api/me/activities/${created.activity.id}`)).body;
    expect(JSON.stringify(mine)).not.toContain("Resposta do colega");
    expect(mine.attempt.answers).toEqual([]);
    expect(await t.prisma.activitySubmission.count()).toBe(0);
  });
});
