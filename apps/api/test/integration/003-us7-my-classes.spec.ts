import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

describe("003/US7 — aluno vê as turmas de que participa (FR-038, contracts/http-api.md)", () => {
  let t: TestApp;
  let teacher: TestUser;
  let student: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    student = await createUser(t, { name: "Aluna Bia", ra: "RA-1" });
  });

  const enrolledAt = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const enroll = async (classId: string, userId: string, days: number) => {
    const enrollment = await createEnrollment(t, classId, userId);
    return t.prisma.enrollment.update({ where: { id: enrollment.id }, data: { enrolledAt: enrolledAt(days) } });
  };

  describe("003/US7-1 Minhas turmas", () => {
    it("só as matrículas ACTIVE, mais recentes primeiro, com o nome do professor e sem outros alunos", async () => {
      const other = await createUser(t, { roles: ["TEACHER"], name: "Professor Caio" });
      const algebra = await createClass(t, teacher.id, { name: "Álgebra", code: "ALG-1", academicYear: 2026, period: "Manhã" });
      const fisica = await createClass(t, other.id, { name: "Física", code: "FIS-1", academicYear: 2025 });
      const quimica = await createClass(t, teacher.id, { name: "Química", code: "QUI-1" });
      await enroll(algebra.id, student.id, 3);
      await enroll(fisica.id, student.id, 1);
      const removed = await enroll(quimica.id, student.id, 0);
      await t.prisma.enrollment.update({
        where: { id: removed.id },
        data: { status: "REMOVED", removedAt: new Date(), removedById: teacher.id },
      });
      const classmate = await createUser(t, { name: "Colega Davi", ra: "RA-2" });
      await enroll(algebra.id, classmate.id, 2);

      const res = await api(t, { cookie: await loginAs(t, student) }).get("/api/me/classes");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        items: [
          {
            id: fisica.id,
            name: "Física",
            code: "FIS-1",
            academicYear: 2025,
            period: null,
            teacherName: "Professor Caio",
            enrolledAt: expect.any(String),
          },
          {
            id: algebra.id,
            name: "Álgebra",
            code: "ALG-1",
            academicYear: 2026,
            period: "Manhã",
            teacherName: "Professora Ada",
            enrolledAt: expect.any(String),
          },
        ],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/Colega Davi|RA-2|password|hash|token|session|invitation/i);
    });

    it("sem matrícula ativa → lista vazia; turma inativa ou arquivada continua listada", async () => {
      const client = api(t, { cookie: await loginAs(t, student) });
      expect((await client.get("/api/me/classes")).body).toEqual({ items: [] });

      const archived = await createClass(t, teacher.id, { code: "ARQ-1" });
      await enroll(archived.id, student.id, 1);
      await t.prisma.schoolClass.update({ where: { id: archived.id }, data: { status: "ARCHIVED", statusChangedAt: new Date() } });
      expect((await client.get("/api/me/classes")).body.items.map((c: { id: string }) => c.id)).toEqual([archived.id]);
    });

    it("sem papel STUDENT → 403; sem sessão → 401", async () => {
      expect((await api(t, { cookie: await loginAs(t, teacher) }).get("/api/me/classes")).body.code).toBe("FORBIDDEN");
      expect((await api(t).get("/api/me/classes")).status).toBe(401);
    });
  });

  describe("003/US7-2 página administrativa da turma", () => {
    it("aluno matriculado em GET /classes/:id → 403; professor-aluno em turma alheia → 404", async () => {
      const schoolClass = await createClass(t, teacher.id, { code: "ALG-1" });
      await enroll(schoolClass.id, student.id, 1);
      const studentClient = api(t, { cookie: await loginAs(t, student) });
      for (const path of ["", "/enrollments", "/invitations"]) {
        const res = await studentClient.get(`/api/classes/${schoolClass.id}${path}`);
        expect({ path, status: res.status, code: res.body.code }).toEqual({ path, status: 403, code: "FORBIDDEN" });
      }

      const teacherStudent = await createUser(t, { roles: ["TEACHER", "STUDENT"], name: "Professor Aluno", ra: "RA-9" });
      await enroll(schoolClass.id, teacherStudent.id, 1);
      const both = api(t, { cookie: await loginAs(t, teacherStudent) });
      const foreign = await both.get(`/api/classes/${schoolClass.id}`);
      expect(foreign.status).toBe(404);
      expect((await both.get("/api/classes/00000000-0000-4000-8000-000000000009")).body).toEqual(foreign.body);
      expect((await both.get("/api/me/classes")).body.items.map((c: { id: string }) => c.id)).toEqual([schoolClass.id]);
    });
  });
});
