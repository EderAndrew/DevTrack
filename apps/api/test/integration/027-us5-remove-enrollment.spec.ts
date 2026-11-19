import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Cohort } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow, getAttempt } from "../helpers/activities";
import { createClass, createCohort, createEnrollment, createSubject, createUser, loginAs, type TestClass, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 027/US5, FR-014 — the MANAGER ends a student's enrollment in the turma: the student stops seeing every disciplina of
 * it at once, the row stays REMOVED (never deleted), the teachers keep what the student did, and a new invitation
 * accepted brings the student back with a new ACTIVE enrollment.
 */
describe("027/US5 027/FR-014 — gestor encerra a matrícula de um aluno", () => {
  let t: TestApp;
  let manager: TestUser;
  let managerClient: ReturnType<typeof api>;
  let cohort: Cohort;
  let ada: TestUser;
  let bd: TestClass;
  let redes: TestClass;
  let student: TestUser;
  let studentClient: ReturnType<typeof api>;
  let enrollmentId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
    manager = await createUser(t, { roles: ["MANAGER"], name: "Gestora Lia" });
    managerClient = api(t, { cookie: await loginAs(t, manager) });
    cohort = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA" });
    ada = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    const turing = await createUser(t, { roles: ["TEACHER"], name: "Professor Turing" });
    bd = await createClass(t, ada.id, { cohortId: cohort.id, subjectId: (await createSubject(t, ada.id, { name: "Banco de Dados" })).id });
    redes = await createClass(t, turing.id, { cohortId: cohort.id, subjectId: (await createSubject(t, turing.id, { name: "Redes" })).id });
    student = await createUser(t, { roles: ["STUDENT"], name: "Aluna Bia", email: "bia@exemplo.com", ra: "RA-2705" });
    studentClient = api(t, { cookie: await loginAs(t, student) });
    enrollmentId = (await createEnrollment(t, bd.id, student.id)).id;
  });

  const remove = (id = enrollmentId, cohortId = cohort.id) => managerClient.post(`/api/cohorts/${cohortId}/enrollments/${id}/remove`, {});

  it("027/US5-1 o aluno deixa de ver as duas disciplinas (atividades, Painel, card, ranking) e a matrícula fica REMOVED, nunca apagada", async () => {
    const { activity: work } = await createActivity(t, bd);
    const { activity: exercise } = await createActivity(t, redes, { type: "EXERCISE" });
    for (const classId of [bd.id, redes.id]) {
      expect((await studentClient.get(`/api/me/activities?classId=${classId}`)).status).toBe(200);
      expect((await studentClient.get(`/api/me/dashboard?classId=${classId}`)).status).toBe(200);
      expect((await studentClient.get(`/api/me/classes/${classId}/ranking`)).status).toBe(200);
    }
    const before = JSON.stringify((await studentClient.get("/api/me/activities")).body);
    expect(before).toContain(work.id);
    expect(before).toContain(exercise.id);

    const res = await remove();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: enrollmentId,
      student: { userId: student.id, name: "Aluna Bia", email: "bia@exemplo.com" },
      status: "REMOVED",
      source: "INVITATION",
      enrolledAt: expect.any(String),
      removedAt: expect.any(String),
    });

    for (const classId of [bd.id, redes.id]) {
      expect((await studentClient.get(`/api/me/activities?classId=${classId}`)).status).toBe(404);
      expect((await studentClient.get(`/api/me/dashboard?classId=${classId}`)).status).toBe(404);
      expect((await studentClient.get(`/api/me/classes/${classId}/ranking`)).status).toBe(404);
    }
    for (const activityId of [work.id, exercise.id]) expect((await studentClient.get(`/api/me/activities/${activityId}`)).status).toBe(404);
    const after = JSON.stringify((await studentClient.get("/api/me/activities")).body);
    expect(after).not.toContain(work.id);
    expect(after).not.toContain(exercise.id);
    const mine = JSON.stringify((await studentClient.get("/api/me/classes")).body);
    expect(mine).not.toContain(bd.id);
    expect(mine).not.toContain(redes.id);

    expect(await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).toMatchObject({
      status: "REMOVED",
      removalReason: "MANAGER",
      removedById: manager.id,
      removedAt: expect.any(Date),
    });
    expect(await t.prisma.auditEvent.findMany({ where: { type: "enrollment.removed" } })).toMatchObject([
      {
        actorType: "USER",
        actorUserId: manager.id,
        targetType: "ENROLLMENT",
        targetId: enrollmentId,
        metadata: { cohortId: cohort.id, userId: student.id, reason: "MANAGER" },
      },
    ]);
    expect((await managerClient.get(`/api/cohorts/${cohort.id}/enrollments?status=REMOVED`)).body.items).toMatchObject([
      { id: enrollmentId, status: "REMOVED" },
    ]);
    expect((await managerClient.get(`/api/cohorts/${cohort.id}`)).body.activeEnrollmentCount).toBe(0);
  });

  it("027/US5-2 o professor ainda vê a entrega, a nota e o comentário do aluno na revisão", async () => {
    const { activity: work } = await createActivity(t, bd);
    const { attemptId } = await createAttemptRow(t, work.id, student.id, {
      submission: { gradeCents: 100, generalFeedback: "Bom trabalho." },
    });
    const adaClient = api(t, { cookie: await loginAs(t, ada) });
    const before = await getAttempt(adaClient, bd.id, work.id, attemptId);
    expect(before.status).toBe(200);

    expect((await remove()).status).toBe(200);

    const after = await getAttempt(adaClient, bd.id, work.id, attemptId);
    expect(after.status).toBe(200);
    expect(after.body).toEqual(before.body);
    expect(after.body).toMatchObject({
      student: { userId: student.id, name: "Aluna Bia" },
      status: "SUBMITTED",
      submission: { grade: "1.00", generalFeedback: "Bom trabalho." },
    });
    expect(await t.prisma.activitySubmission.count({ where: { attemptId } })).toBe(1);
  });

  it("027/US5-3 o gestor convida o mesmo e-mail de novo e o aceite cria uma nova matrícula ACTIVE; a encerrada fica no histórico", async () => {
    expect((await remove()).status).toBe(200);
    expect((await managerClient.post(`/api/cohorts/${cohort.id}/invitations`, { email: "bia@exemplo.com" })).status).toBe(201);
    await t.flushMail();
    const token = t.mailer.lastTokenFor("bia@exemplo.com", "class-invitation")!;
    expect(token).toEqual(expect.any(String));
    const accepted = await studentClient.post("/api/class-invitations/accept", { token });
    expect(accepted.body).toMatchObject({ alreadyEnrolled: false });
    expect(accepted.status).toBe(200);
    expect(accepted.body.alreadyEnrolled).toBe(false);

    const rows = await t.prisma.enrollment.findMany({ where: { cohortId: cohort.id, studentUserId: student.id }, orderBy: { enrolledAt: "asc" } });
    expect(rows.map((row) => row.status)).toEqual(["REMOVED", "ACTIVE"]);
    expect(rows[0]!.id).toBe(enrollmentId);
    for (const classId of [bd.id, redes.id]) expect((await studentClient.get(`/api/me/activities?classId=${classId}`)).status).toBe(200);
  });

  it("027/FR-014 remover de novo é 200 sem nova auditoria; outra turma ou inexistente → 404; turma arquivada → 409; o professor não remove (403)", async () => {
    expect((await remove()).status).toBe(200);
    const again = await remove();
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("REMOVED");
    expect(await t.prisma.auditEvent.count({ where: { type: "enrollment.removed" } })).toBe(1);

    const other = await createCohort(t, { code: "OUTRA" });
    const otherEnrollment = await t.prisma.enrollment.create({
      data: { cohortId: other.id, studentUserId: student.id, status: "ACTIVE", enrolledAt: new Date() },
    });
    const foreign = await remove(otherEnrollment.id);
    expect(foreign.status).toBe(404);
    expect((await remove("00000000-0000-4000-8000-000000000009")).body).toEqual(foreign.body);
    expect((await remove(otherEnrollment.id, "00000000-0000-4000-8000-000000000008")).body).toEqual(foreign.body);
    expect((await api(t, { cookie: await loginAs(t, ada) }).post(`/api/cohorts/${other.id}/enrollments/${otherEnrollment.id}/remove`, {})).status).toBe(403);

    await t.prisma.cohort.update({ where: { id: other.id }, data: { status: "ARCHIVED", statusChangedAt: new Date() } });
    const archived = await remove(otherEnrollment.id, other.id);
    expect(archived.status).toBe(409);
    expect(archived.body.code).toBe("INVALID_STATE_TRANSITION");
    expect((await t.prisma.enrollment.findUniqueOrThrow({ where: { id: otherEnrollment.id } })).status).toBe("ACTIVE");
    expect((await managerClient.post(`/api/cohorts/${cohort.id}/enrollments/${enrollmentId}/remove`, { reason: "X" })).status).toBe(400);
  });
});
