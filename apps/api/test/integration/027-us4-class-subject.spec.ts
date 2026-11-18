import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyWork, createActivity, saveAnswers, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { applyExam, createExam } from "../helpers/exams";
import {
  createClass,
  createCohort,
  createEnrollment,
  createSubject,
  createUser,
  loginAs,
  type TestClass,
  type TestUser,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork } from "../helpers/works";

/** Noon in São Paulo on the calendar's last day (15:00 UTC); the next day starts at 03:00 UTC. */
const LAST_DAY = "2026-06-30T15:00:00.000Z";
const LAST_MINUTE = "2026-07-01T02:59:00.000Z";
const NEXT_DAY = "2026-07-01T03:00:00.000Z";
const CALENDAR = { startsOn: "2026-02-02", endsOn: "2026-06-30" };
const text = (value: string): Answer => ({ kind: "TEXT", text: value });

describe("027/US4 — professor trabalha na sua disciplina da turma como hoje (FR-021–FR-024)", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: ReturnType<typeof api>;
  let syllabus: ConfirmedSyllabus;
  let schoolClass: TestClass;
  let student: TestUser;

  beforeAll(async () => {
    clock = new FixedClock("2026-05-04T15:00:00.000Z");
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set("2026-05-04T15:00:00.000Z");
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ana" });
    client = await asUser(teacher);
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    const cohort = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA" });
    schoolClass = await createClass(t, teacher.id, { cohortId: cohort.id, subjectId: syllabus.subject.id, ...CALENDAR });
    student = await createUser(t, { roles: ["STUDENT"], name: "Aluna Bia" });
    await createEnrollment(t, schoolClass.id, student.id);
  });

  const asUser = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });
  const changeStatus = (status: string, id = schoolClass.id) => client.post(`/api/classes/${id}/status`, { status });
  const setCohortStatus = (status: "ACTIVE" | "INACTIVE" | "ARCHIVED") =>
    t.prisma.cohort.update({ where: { id: schoolClass.cohortId }, data: { status, statusChangedAt: new Date() } });
  /** An open answer published a day before the clock and due a week after it (the clock decides, 012 P10). */
  const openActivity = () =>
    createActivity(t, schoolClass, {
      questions: [{ type: "OPEN_ANSWER" }],
      publishAt: new Date(clock.now().getTime() - 86_400_000),
      deadline: new Date(clock.now().getTime() + 7 * 86_400_000),
    });
  const approvedWork = () => createWork(t, teacher.id, { syllabus });
  const apply = async (classId = schoolClass.id) =>
    applyWork(client, classId, (await approvedWork()).id, { acknowledgeOutOfScope: true, attendance: "NONE" });

  it("027/US4-1 abre a disciplina da turma com a disciplina, a turma e os alunos matriculados, só para leitura", async () => {
    const res = await client.get(`/api/classes/${schoolClass.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      subject: { id: syllabus.subject.id },
      cohort: { id: schoolClass.cohortId, name: "ADS 3NA", code: "ADS-3NA" },
      effectiveStatus: "ACTIVE",
      canChangeStatus: false,
    });

    const roster = await client.get(`/api/classes/${schoolClass.id}/enrollments`);
    expect(roster.status).toBe(200);
    expect(roster.body.items).toHaveLength(1);
    expect(Object.keys(roster.body.items[0]).sort()).toEqual(["enrolledAt", "id", "removedAt", "status", "student"]);
    expect(Object.keys(roster.body.items[0].student).sort()).toEqual(["email", "name", "ra", "userId"]);
    expect(roster.body.items[0]).toMatchObject({ status: "ACTIVE", student: { userId: student.id, name: "Aluna Bia" } });
  });

  it("027/US4-2 o professor não cria turma, não convida, não inclui nem remove aluno e não muda a turma (403)", async () => {
    const enrollment = await t.prisma.enrollment.findFirstOrThrow({ where: { studentUserId: student.id } });
    const cohortId = schoolClass.cohortId;
    for (const [method, path, body] of [
      ["post", "/api/cohorts", { name: "Nova", code: "N-1", academicYear: 2026 }],
      ["get", `/api/cohorts/${cohortId}`, undefined],
      ["patch", `/api/cohorts/${cohortId}`, { name: "Outra" }],
      ["post", `/api/cohorts/${cohortId}/status`, { to: "ARCHIVED" }],
      ["post", `/api/cohorts/${cohortId}/invitations`, { email: "aluno@example.test" }],
      ["post", `/api/cohorts/${cohortId}/student-lookup`, { email: "aluno@example.test" }],
      ["post", `/api/cohorts/${cohortId}/enrollments`, { email: "aluno@example.test" }],
      ["post", `/api/classes/${schoolClass.id}/enrollments/${enrollment.id}/remove`, {}],
    ] as const) {
      const res = method === "get" ? await client.get(path) : await client[method](path, body ?? {});
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    expect((await client.patch(`/api/classes/${schoolClass.id}`, { name: "Outra" })).status).toBe(400);
    expect(await t.prisma.cohort.findUniqueOrThrow({ where: { id: cohortId } })).toMatchObject({ name: "ADS 3NA", status: "ACTIVE" });
    expect(await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).toMatchObject({ status: "ACTIVE" });
  });

  it("027/US4-3 arquivada após o calendário: sem novas atividades nem alterações, consultável; a turma e a outra disciplina intactas", async () => {
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherClass = await createClass(t, other.id, {
      cohortId: schoolClass.cohortId,
      subjectId: (await createSubject(t, other.id)).id,
      ...CALENDAR,
    });
    clock.set(NEXT_DAY);

    const archived = await changeStatus("ARCHIVED");
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ ownStatus: "ARCHIVED", effectiveStatus: "ARCHIVED", status: "ARCHIVED" });
    expect((await t.prisma.auditEvent.findMany({ where: { type: "class.status_changed" } })).map((event) => event.metadata)).toEqual([
      { from: "ACTIVE", to: "ARCHIVED" },
    ]);

    const applied = await apply();
    expect([applied.status, applied.body.code]).toEqual([409, "CLASS_NOT_ACTIVE"]);
    const meetings = await client.put(`/api/classes/${schoolClass.id}/meetings`, { planRevision: null, add: ["2026-03-02"], remove: [], resolutions: [] });
    expect([meetings.status, meetings.body.code]).toEqual([409, "PLAN_ARCHIVED"]);
    expect((await client.get(`/api/classes/${schoolClass.id}`)).status).toBe(200);
    expect((await client.get(`/api/classes/${schoolClass.id}/enrollments`)).status).toBe(200);

    expect(await t.prisma.cohort.findUniqueOrThrow({ where: { id: schoolClass.cohortId } })).toMatchObject({ status: "ACTIVE" });
    expect(await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: otherClass.id } })).toMatchObject({ status: "ACTIVE" });

    // Arquivar é final (FR-022).
    const back = await changeStatus("ACTIVE");
    expect([back.status, back.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
  });

  it("027/US4-4 a atividade aplicada à disciplina da turma segue as regras de hoje para o aluno da turma", async () => {
    const created = await openActivity();
    const studentClient = await asUser(student);
    const listed = await studentClient.get(`/api/me/activities?classId=${schoolClass.id}`);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual([created.activity.id]);
    expect((await startAttempt(studentClient, created.activity.id)).status).toBe(200);
    const saved = await saveAnswers(studentClient, created.activity.id, [
      { questionId: created.questionIds[0]!, answer: text("resposta"), baseRevision: 0 },
    ]);
    expect(saved.status).toBe(200);

    // A student of another turma never reaches it.
    const outsider = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, (await createClass(t, teacher.id)).id, outsider.id);
    expect((await (await asUser(outsider)).post(`/api/me/activities/${created.activity.id}/attempt`, {})).status).toBe(404);
  });

  it("027/US4-5 encerrar e arquivar só depois do último dia do calendário; sem calendário nunca", async () => {
    clock.set(LAST_DAY);
    expect((await client.get(`/api/classes/${schoolClass.id}`)).body.canChangeStatus).toBe(false);
    for (const status of ["INACTIVE", "ARCHIVED"]) {
      const refused = await changeStatus(status);
      expect([refused.status, refused.body.code]).toEqual([409, "CLASS_CALENDAR_NOT_ENDED"]);
    }
    clock.set(LAST_MINUTE);
    expect((await changeStatus("INACTIVE")).body.code).toBe("CLASS_CALENDAR_NOT_ENDED");

    clock.set(NEXT_DAY);
    expect((await client.get(`/api/classes/${schoolClass.id}`)).body.canChangeStatus).toBe(true);
    const closed = await changeStatus("INACTIVE");
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({ ownStatus: "INACTIVE", effectiveStatus: "INACTIVE" });
    expect((await changeStatus("ACTIVE")).body).toMatchObject({ ownStatus: "ACTIVE" });

    const undated = await createClass(t, teacher.id, { subjectId: (await createSubject(t, teacher.id)).id });
    expect((await client.get(`/api/classes/${undated.id}`)).body.canChangeStatus).toBe(false);
    const refused = await changeStatus("INACTIVE", undated.id);
    expect([refused.status, refused.body.code]).toEqual([409, "CLASS_CALENDAR_NOT_ENDED"]);
    expect(await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: undated.id } })).toMatchObject({ status: "ACTIVE" });

    // Turma arquivada: a disciplina da turma não muda mais.
    await setCohortStatus("ARCHIVED");
    expect((await client.get(`/api/classes/${schoolClass.id}`)).body.canChangeStatus).toBe(false);
    const archivedCohort = await changeStatus("INACTIVE");
    expect([archivedCohort.status, archivedCohort.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
  });

  it("027/FR-023 turma inativa: aplicar atividade e salvar resposta recusados com os códigos de hoje; arquivada: plano recusado", async () => {
    const created = await openActivity();
    const studentClient = await asUser(student);
    expect((await startAttempt(studentClient, created.activity.id)).status).toBe(200);

    await setCohortStatus("INACTIVE");
    expect((await client.get(`/api/classes/${schoolClass.id}`)).body).toMatchObject({ ownStatus: "ACTIVE", effectiveStatus: "INACTIVE" });
    const applied = await apply();
    expect([applied.status, applied.body.code]).toEqual([409, "CLASS_NOT_ACTIVE"]);
    const saved = await saveAnswers(studentClient, created.activity.id, [
      { questionId: created.questionIds[0]!, answer: text("x"), baseRevision: 0 },
    ]);
    expect([saved.status, saved.body.code]).toEqual([409, "CLASS_NOT_ACTIVE"]);

    await setCohortStatus("ARCHIVED");
    const meetings = await client.put(`/api/classes/${schoolClass.id}/meetings`, { planRevision: null, add: ["2026-03-02"], remove: [], resolutions: [] });
    expect([meetings.status, meetings.body.code]).toEqual([409, "PLAN_ARCHIVED"]);
  });

  it("027/FR-024 trabalho e prova de outra disciplina → SUBJECT_MISMATCH; duas disciplinas do mesmo professor na turma não se misturam", async () => {
    const otherSyllabus = await createConfirmedSyllabus(t, teacher.id);
    const second = await createClass(t, teacher.id, { cohortId: schoolClass.cohortId, subjectId: otherSyllabus.subject.id, ...CALENDAR });

    const work = await createWork(t, teacher.id, { syllabus: otherSyllabus });
    const wrongWork = await applyWork(client, schoolClass.id, work.id, { acknowledgeOutOfScope: true, attendance: "NONE" });
    expect([wrongWork.status, wrongWork.body.code]).toEqual([422, "SUBJECT_MISMATCH"]);
    const exam = await createExam(t, teacher.id, { syllabus: otherSyllabus });
    const wrongExam = await applyExam(client, schoolClass.id, exam.id, { acknowledgeOutOfScope: true, attendance: "NONE" });
    expect([wrongExam.status, wrongExam.body.code]).toEqual([422, "SUBJECT_MISMATCH"]);

    const created = await openActivity();
    expect((await client.get(`/api/classes/${second.id}/activities`)).body.items).toEqual([]);
    expect((await client.get(`/api/classes/${schoolClass.id}/activities`)).body.items.map((item: { id: string }) => item.id)).toEqual([
      created.activity.id,
    ]);
    const studentClient = await asUser(student);
    expect((await studentClient.get(`/api/me/activities?classId=${second.id}`)).body.items).toEqual([]);
    expect((await client.get(`/api/classes/${second.id}/ranking`)).status).toBe(200);
    expect((await client.get(`/api/classes/${second.id}/activities/${created.activity.id}`)).status).toBe(404);
  });
});
