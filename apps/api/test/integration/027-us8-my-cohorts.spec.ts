import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createAttemptRow, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createClass, createCohort, createEnrollment, createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 027/US8 — "Minhas turmas" by ano letivo (FR-025): each turma once with its disciplinas and their teachers, whatever the
 * effective status; a closed turma (FR-004) or an archived disciplina stays readable and refuses every write of the
 * student with the codes of a closed class (`409 CLASS_NOT_ACTIVE`).
 */

const NOW = "2027-03-10T15:00:00.000Z";
const DAY = 86_400_000;
const text = (value: string): Answer => ({ kind: "TEXT", text: value });

describe("027/US8 — aluno vê as suas turmas e matérias", () => {
  let t: TestApp;
  let clock: FixedClock;
  let eder: TestUser;
  let ana: TestUser;
  let student: TestUser;

  beforeAll(async () => {
    clock = new FixedClock(NOW);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(NOW);
    eder = await createUser(t, { roles: ["TEACHER"], name: "Prof. Eder" });
    ana = await createUser(t, { roles: ["TEACHER"], name: "Prof. Ana" });
    student = await createUser(t, { roles: ["STUDENT"], name: "Aluna Bia", ra: "RA-1" });
  });

  const asStudent = async () => api(t, { cookie: await loginAs(t, student) });
  const at = (minutes: number) => new Date(Date.parse(NOW) - DAY + minutes * 60_000);
  const subjectClass = async (cohortId: string, teacher: TestUser, subjectName: string, minutes: number) =>
    createClass(t, teacher.id, {
      cohortId,
      subjectId: (await createSubject(t, teacher.id, { name: subjectName })).id,
      createdAt: at(minutes),
    });
  const enroll = async (classOrCohort: { cohortId: string } | { id: string; kind: "cohort" }, days: number) => {
    const cohortId = "cohortId" in classOrCohort ? classOrCohort.cohortId : classOrCohort.id;
    return t.prisma.enrollment.create({
      data: { cohortId, studentUserId: student.id, status: "ACTIVE", enrolledAt: new Date(Date.parse(NOW) - days * DAY) },
    });
  };
  const myCohorts = async () => {
    const res = await (await asStudent()).get("/api/me/classes");
    expect(res.status).toBe(200);
    return res.body as {
      years: {
        academicYear: number;
        cohorts: { id: string; name: string; status: string; classes: { classId: string; subjectName: string | null; teacherName: string; effectiveStatus: string }[] }[];
      }[];
    };
  };
  const openAssignment = (schoolClass: { id: string; teacherId: string }) =>
    createActivity(t, schoolClass, {
      questions: [{ type: "OPEN_ANSWER" }],
      publishAt: new Date(Date.parse(NOW) - DAY),
      deadline: new Date(Date.parse(NOW) + 7 * DAY),
    });

  it("027/US8-1 a turma aparece uma vez, com as duas disciplinas e os nomes dos professores", async () => {
    const cohort = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA", academicYear: 2027, period: "2027.1" });
    const bd = await subjectClass(cohort.id, eder, "Banco de Dados", 1);
    const redes = await subjectClass(cohort.id, ana, "Redes", 2);
    await enroll(bd, 1);
    const classmate = await createUser(t, { roles: ["STUDENT"], name: "Colega Davi", ra: "RA-2" });
    await createEnrollment(t, bd.id, classmate.id);

    const body = await myCohorts();
    expect(body).toEqual({
      years: [
        {
          academicYear: 2027,
          cohorts: [
            {
              id: cohort.id,
              name: "ADS 3NA",
              code: "ADS-3NA",
              period: "2027.1",
              status: "ACTIVE",
              classes: [
                { classId: bd.id, subjectName: "Banco de Dados", teacherName: "Prof. Eder", effectiveStatus: "ACTIVE" },
                { classId: redes.id, subjectName: "Redes", teacherName: "Prof. Ana", effectiveStatus: "ACTIVE" },
              ],
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(body)).not.toMatch(/Colega Davi|RA-2|@|token|invitation/i);
  });

  it("027/US8-2 turma ainda sem disciplina: listada com classes vazio", async () => {
    const empty = await createCohort(t, { name: "ADS 1NA", code: "ADS-1NA", academicYear: 2027 });
    await enroll({ id: empty.id, kind: "cohort" }, 1);
    expect((await myCohorts()).years).toEqual([
      { academicYear: 2027, cohorts: [expect.objectContaining({ id: empty.id, status: "ACTIVE", classes: [] })] },
    ]);
  });

  it("027/US8-3 turma de 2026 encerrada aparece no seu ano, só para leitura; a de 2027 primeiro", async () => {
    const old = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026 });
    const current = await createCohort(t, { name: "ADS 4NA", code: "ADS-4NA", academicYear: 2027 });
    const oldClass = await subjectClass(old.id, eder, "Banco de Dados", 1);
    const newClass = await subjectClass(current.id, ana, "Redes", 2);
    const enrollment = await enroll(oldClass, 400);
    await enroll(newClass, 10);
    const started = await openAssignment(oldClass);
    await createAttemptRow(t, started.activity.id, student.id);
    const notStarted = await openAssignment(oldClass);

    // O gestor encerra a turma de 2026 (FR-004): a matrícula continua ACTIVE.
    await t.prisma.cohort.update({ where: { id: old.id }, data: { status: "INACTIVE", statusChangedAt: new Date() } });
    expect(await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).toMatchObject({ status: "ACTIVE" });

    const body = await myCohorts();
    expect(body.years.map((year) => year.academicYear)).toEqual([2027, 2026]);
    expect(body.years[1]!.cohorts).toEqual([
      expect.objectContaining({
        id: old.id,
        status: "INACTIVE",
        classes: [expect.objectContaining({ classId: oldClass.id, effectiveStatus: "INACTIVE" })],
      }),
    ]);
    expect(body.years[0]!.cohorts[0]).toMatchObject({ id: current.id, status: "ACTIVE" });

    const client = await asStudent();
    const list = await client.get(`/api/me/activities?classId=${oldClass.id}`);
    expect(list.status).toBe(200);
    // 029/FR-007 (SC-005): a closed turma does not move an ACTIVE activity (029 HC1); it stays in the list, read-only.
    expect(list.body.items.map((item: { id: string }) => item.id).sort()).toEqual([started.activity.id, notStarted.activity.id].sort());
    expect((await client.get(`/api/me/dashboard?classId=${oldClass.id}`)).status).toBe(200);
    expect((await client.get(`/api/me/activities/${started.activity.id}`)).status).toBe(200);

    const start = await startAttempt(client, notStarted.activity.id);
    expect([start.status, start.body.code]).toEqual([409, "CLASS_NOT_ACTIVE"]);
    const saved = await saveAnswers(client, started.activity.id, [{ questionId: started.questionIds[0]!, answer: text("x"), baseRevision: 0 }]);
    expect([saved.status, saved.body.code]).toEqual([409, "CLASS_NOT_ACTIVE"]);
    const submitted = await submitAttempt(client, started.activity.id);
    expect([submitted.status, submitted.body.code]).toEqual([409, "CLASS_NOT_ACTIVE"]);
  });

  it("027/US8-4 disciplina arquivada pelo professor numa turma ativa: ARCHIVED na lista e consultável", async () => {
    const cohort = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA", academicYear: 2027 });
    const bd = await subjectClass(cohort.id, eder, "Banco de Dados", 1);
    const redes = await subjectClass(cohort.id, ana, "Redes", 2);
    await enroll(bd, 1);
    await t.prisma.schoolClass.update({ where: { id: bd.id }, data: { status: "ARCHIVED", statusChangedAt: new Date() } });

    const [only] = (await myCohorts()).years[0]!.cohorts;
    expect(only).toMatchObject({ status: "ACTIVE" });
    expect(only!.classes.map(({ classId, effectiveStatus }) => ({ classId, effectiveStatus }))).toEqual([
      { classId: bd.id, effectiveStatus: "ARCHIVED" },
      { classId: redes.id, effectiveStatus: "ACTIVE" },
    ]);
    const list = await (await asStudent()).get(`/api/me/activities?classId=${bd.id}`);
    expect(list.status).toBe(200);
  });

  it("027/FR-025 turmas do mesmo ano: a matrícula mais recente primeiro; matrícula encerrada some", async () => {
    const first = await createCohort(t, { name: "ADS 3NA", academicYear: 2027 });
    const second = await createCohort(t, { name: "ADS 3NB", academicYear: 2027 });
    const removed = await createCohort(t, { name: "ADS 3NC", academicYear: 2027 });
    await enroll({ id: first.id, kind: "cohort" }, 5);
    await enroll({ id: second.id, kind: "cohort" }, 1);
    const gone = await enroll({ id: removed.id, kind: "cohort" }, 0);
    await t.prisma.enrollment.update({ where: { id: gone.id }, data: { status: "REMOVED", removedAt: new Date(), removedById: eder.id } });

    expect((await myCohorts()).years[0]!.cohorts.map((cohort) => cohort.id)).toEqual([second.id, first.id]);
  });
});
