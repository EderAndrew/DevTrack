import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../helpers/clock";
import { createClass, createCohort, createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 030 — "Minhas turmas" redesenhada: `GET /me/classes` traz, em cada turma, a data da matrícula ativa do próprio aluno
 * (`enrolledAt`, FR-012); o resto da resposta e a ordem continuam como na 027 (ano letivo desc, matrícula desc).
 */

const NOW = "2027-03-10T15:00:00.000Z";
const DAY = 86_400_000;

describe("030 — Minhas turmas: data de entrada na turma", () => {
  let t: TestApp;
  let teacher: TestUser;
  let student: TestUser;

  beforeAll(async () => {
    t = await createTestApp({ clock: new FixedClock(NOW) });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Prof. Eder" });
    student = await createUser(t, { roles: ["STUDENT"], name: "Aluna Bia", ra: "RA-1" });
  });

  const subjectClass = async (cohortId: string, subjectName: string) =>
    createClass(t, teacher.id, { cohortId, subjectId: (await createSubject(t, teacher.id, { name: subjectName })).id });
  const enroll = (cohortId: string, studentUserId: string, enrolledAt: Date, status: "ACTIVE" | "REMOVED" = "ACTIVE") =>
    t.prisma.enrollment.create({ data: { cohortId, studentUserId, status, enrolledAt } });
  const myCohorts = async (user: TestUser) => {
    const res = await api(t, { cookie: await loginAs(t, user) }).get("/api/me/classes");
    expect(res.status).toBe(200);
    return res.body as { years: { academicYear: number; cohorts: Record<string, unknown>[] }[] };
  };

  it("030/FR-012 cada turma traz o enrolledAt da matrícula ativa do aluno, na ordem de hoje", async () => {
    const older = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA", academicYear: 2027, period: "2027.1" });
    const newer = await createCohort(t, { name: "ADS 4NA", code: "ADS-4NA", academicYear: 2027, period: null });
    const past = await createCohort(t, { name: "ADS 1NA", code: "ADS-1NA", academicYear: 2026, period: null });
    await subjectClass(older.id, "Banco de Dados");
    await subjectClass(newer.id, "Redes");
    await enroll(older.id, student.id, new Date("2027-02-01T12:30:00.000Z"));
    await enroll(newer.id, student.id, new Date("2027-02-20T09:15:00.000Z"));
    await enroll(past.id, student.id, new Date("2026-03-05T18:00:00.000Z"));

    const body = await myCohorts(student);
    expect(body.years.map((year) => year.academicYear)).toEqual([2027, 2026]);
    expect(body.years.flatMap((year) => year.cohorts.map((cohort) => [cohort.code, cohort.enrolledAt]))).toEqual([
      ["ADS-4NA", "2027-02-20T09:15:00.000Z"],
      ["ADS-3NA", "2027-02-01T12:30:00.000Z"],
      ["ADS-1NA", "2026-03-05T18:00:00.000Z"],
    ]);
  });
});
