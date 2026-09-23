import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import {
  createClass,
  createClassInvitation,
  createEnrollment,
  createUser,
  loginAs,
  type TestUser,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

describe("003/US6 — professor vê os alunos da turma e remove um aluno (FR-042–FR-047)", () => {
  let t: TestApp;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let client: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    schoolClass = await createClass(t, teacher.id, { code: "ALG-1" });
    client = api(t, { cookie: await loginAs(t, teacher) });
  });

  const base = () => `/api/classes/${schoolClass.id}/enrollments`;
  const list = (query = "") => client.get(`${base()}${query ? `?${query}` : ""}`);
  const remove = (id: string) => client.post(`${base()}/${id}/remove`, {});
  const names = (res: { body: { items: { student: { name: string } }[] } }) => res.body.items.map((i) => i.student.name);
  const enroll = async (name: string, ra: string | undefined, classId = schoolClass.id) => {
    const student = await createUser(t, { name, ...(ra ? { ra } : {}) });
    const enrollment = await createEnrollment(t, classId, student.id);
    return { student, enrollment };
  };

  describe("003/US6-1 detalhe da turma", () => {
    it("activeStudentCount conta só as matrículas ativas", async () => {
      await enroll("Ana", "RA-1");
      const { enrollment } = await enroll("Bruno", "RA-2");
      expect((await client.get(`/api/classes/${schoolClass.id}`)).body.activeStudentCount).toBe(2);
      expect((await remove(enrollment.id)).status).toBe(200);
      expect((await client.get(`/api/classes/${schoolClass.id}`)).body.activeStudentCount).toBe(1);
    });
  });

  describe("003/US6-2 lista", () => {
    it("por nome, sem diferenciar caixa; pesquisa por parte do nome ou prefixo do RA; padrão ACTIVE; sem dados de autenticação", async () => {
      const { student: ana } = await enroll("ana Souza", "RA-2026.001");
      await enroll("Bruno Lima", "RA-2026.002");
      await enroll("Carla Dias", "XB-77");
      const { enrollment: removed } = await enroll("Davi Rocha", "RA-9");
      await t.prisma.enrollment.update({
        where: { id: removed.id },
        data: { status: "REMOVED", removedAt: new Date(), removedById: teacher.id },
      });
      const other = await createClass(t, teacher.id, { code: "OUTRA" });
      await enroll("Ana de Outra Turma", "RA-5", other.id);

      const all = await list();
      expect(all.status).toBe(200);
      expect(names(all)).toEqual(["ana Souza", "Bruno Lima", "Carla Dias"]);
      expect(all.body.items[0]).toEqual({
        id: expect.any(String),
        student: { userId: ana.id, name: "ana Souza", email: ana.email, ra: "RA-2026.001" },
        status: "ACTIVE",
        enrolledAt: expect.any(String),
        removedAt: null,
      });
      expect(JSON.stringify(all.body)).not.toMatch(/password|hash|token|session/i);

      expect(names(await list("query=SOUZA"))).toEqual(["ana Souza"]);
      expect(names(await list("query=ra-2026"))).toEqual(["ana Souza", "Bruno Lima"]);
      expect(names(await list("query=2026"))).toEqual([]);
      expect(names(await list("query=%25"))).toEqual([]);
      const removedList = await list("status=REMOVED");
      expect(names(removedList)).toEqual(["Davi Rocha"]);
      expect(removedList.body.items[0].removedAt).toEqual(expect.any(String));
    });

    it("20 por página com cursor, mantendo a ordem por nome", async () => {
      for (let i = 0; i < 23; i += 1) await enroll(`Aluno ${String(i).padStart(2, "0")}`, `RA-${i}`);
      const first = await list();
      expect(first.body.items).toHaveLength(20);
      expect(first.body.items[0].student.name).toBe("Aluno 00");
      const second = await list(`cursor=${first.body.nextCursor}`);
      expect(names(second)).toEqual(["Aluno 20", "Aluno 21", "Aluno 22"]);
      expect(second.body.nextCursor).toBeNull();
      expect((await list("cursor=nao-e-cursor")).status).toBe(400);
    });
  });

  describe("003/US6-3 remoção", () => {
    it("REMOVED com data e autor, auditada; conta, papel, perfil e outras matrículas intactos", async () => {
      const { student, enrollment } = await enroll("Ana", "RA-1");
      const other = await createClass(t, teacher.id, { code: "OUTRA" });
      const elsewhere = await createEnrollment(t, other.id, student.id);
      const before = await t.prisma.user.findUniqueOrThrow({ where: { id: student.id }, include: { roles: true, studentProfile: true } });

      const res = await remove(enrollment.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: enrollment.id, status: "REMOVED", removedAt: expect.any(String) });
      expect(await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).toMatchObject({
        status: "REMOVED",
        removedById: teacher.id,
      });
      expect(await t.prisma.user.findUniqueOrThrow({ where: { id: student.id }, include: { roles: true, studentProfile: true } })).toEqual(before);
      expect((await t.prisma.enrollment.findUniqueOrThrow({ where: { id: elsewhere.id } })).status).toBe("ACTIVE");
      expect(await t.prisma.auditEvent.findMany({ where: { type: "enrollment.removed" } })).toMatchObject([
        {
          actorType: "USER",
          actorUserId: teacher.id,
          targetType: "ENROLLMENT",
          targetId: enrollment.id,
          metadata: { classId: schoolClass.id, userId: student.id },
        },
      ]);
    });
  });

  describe("003/US6-4 remover de novo", () => {
    it("200 sem efeito e sem nova auditoria; duas remoções simultâneas → um efeito", async () => {
      const { enrollment } = await enroll("Ana", "RA-1");
      const results = await Promise.all([remove(enrollment.id), remove(enrollment.id)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const removedAt = (await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).removedAt;

      expect((await remove(enrollment.id)).status).toBe(200);
      expect((await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).removedAt).toEqual(removedAt);
      expect(await t.prisma.auditEvent.count({ where: { type: "enrollment.removed" } })).toBe(1);
    });
  });

  describe("003/US6-5 convidado de novo", () => {
    it("novo aceite cria outra matrícula ativa; a removida continua no histórico", async () => {
      const { student, enrollment } = await enroll("Ana", "RA-1");
      expect((await remove(enrollment.id)).status).toBe(200);

      const { token } = await createClassInvitation(t, schoolClass.id, student.email);
      const accepted = await api(t, { cookie: await loginAs(t, student) }).post("/api/class-invitations/accept", { token });
      expect(accepted.status).toBe(200);
      expect(accepted.body.alreadyEnrolled).toBe(false);

      const rows = await t.prisma.enrollment.findMany({ where: { studentUserId: student.id, classId: schoolClass.id } });
      expect(rows.map((r) => r.status).sort()).toEqual(["ACTIVE", "REMOVED"]);
      expect(names(await list())).toEqual(["Ana"]);
    });
  });

  describe("003/US6-6 contexto", () => {
    it("matrícula de outra turma ou turma de outro professor → 404 como inexistente", async () => {
      const other = await createClass(t, teacher.id, { code: "OUTRA" });
      const { enrollment } = await enroll("Ana", "RA-1", other.id);
      const foreign = await remove(enrollment.id);
      expect(foreign.status).toBe(404);
      expect((await remove("00000000-0000-4000-8000-000000000009")).body).toEqual(foreign.body);

      const stranger = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })) });
      expect((await stranger.get(`/api/classes/${other.id}/enrollments`)).status).toBe(404);
      expect((await stranger.post(`/api/classes/${other.id}/enrollments/${enrollment.id}/remove`, {})).status).toBe(404);
      expect((await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("ACTIVE");
    });

    it("turma arquivada → remoção 409 INVALID_STATE_TRANSITION; a lista continua disponível", async () => {
      const { enrollment } = await enroll("Ana", "RA-1");
      await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "ARCHIVED", statusChangedAt: new Date() } });
      const res = await remove(enrollment.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
      expect(names(await list())).toEqual(["Ana"]);
    });
  });
});
