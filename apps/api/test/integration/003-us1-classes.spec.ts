import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createClassInvitation,
  createCohort,
  createEnrollment,
  createUser,
  loginAs,
  type TestUser,
  uniqueEmail,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const VALID = { name: "Programação Orientada a Objetos", code: "POO-2026-01", academicYear: 2026, period: "2º semestre" };

/**
 * 003/US1 rewritten by 027 (T020): the turma is the MANAGER's (`/cohorts`), so the actor is the MANAGER and the
 * code is unique per ano letivo (027/FR-002) instead of per teacher. The behavior of each scenario is the 003 one.
 */
describe("003/US1 — o gestor cria e administra as turmas (FR-001–FR-008, emenda 027)", () => {
  let t: TestApp;
  let manager: TestUser;
  let client: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    manager = await createUser(t, { roles: ["MANAGER"], name: "Gestora Teste" });
    client = await asUser(manager);
  });

  const asUser = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((item) => item.id);

  describe("003/US1-1 criar turma", () => {
    it("cria ACTIVE, registra quem criou, visível na lista e auditada", async () => {
      const res = await client.post("/api/cohorts", { ...VALID, name: `  ${VALID.name}  `, description: "Turma da manhã" });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        name: VALID.name,
        code: VALID.code,
        academicYear: 2026,
        period: "2º semestre",
        description: "Turma da manhã",
        status: "ACTIVE",
        activeEnrollmentCount: 0,
        classCount: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const row = await t.prisma.cohort.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.createdById).toBe(manager.id);
      expect(row.searchKey).toBe("programacao orientada a objetos poo-2026-01");
      expect(await events("cohort.created")).toMatchObject([
        { actorType: "USER", actorUserId: manager.id, targetType: "COHORT", targetId: row.id, metadata: { code: VALID.code, academicYear: 2026 } },
      ]);
      expect(ids(await client.get("/api/cohorts"))).toEqual([row.id]);
    });

    it("período e descrição são opcionais", async () => {
      const res = await client.post("/api/cohorts", { name: "Banco de Dados", code: "BD-1", academicYear: 2026 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ period: null, description: null });
    });

    it.each([
      ["sem nome", { ...VALID, name: " " }],
      ["código com espaço", { ...VALID, code: "POO 01" }],
      ["código longo", { ...VALID, code: "X".repeat(31) }],
      ["ano fora do intervalo", { ...VALID, academicYear: 1899 }],
      ["ano não inteiro", { ...VALID, academicYear: 2026.5 }],
      ["período longo", { ...VALID, period: "p".repeat(61) }],
      ["descrição longa", { ...VALID, description: "d".repeat(1001) }],
      ["responsável no corpo", { ...VALID, teacherId: crypto.randomUUID() }],
      ["situação no corpo", { ...VALID, status: "ARCHIVED" }],
    ])("%s → 400 e nada criado", async (_case, body) => {
      const res = await client.post("/api/cohorts", body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(await t.prisma.cohort.count()).toBe(0);
    });
  });

  describe("003/US1-2 pesquisa, filtros e paginação", () => {
    it("pesquisa sem acento e sem maiúsculas, por nome ou código", async () => {
      const poo = await createCohort(t, { name: "Programação Orientada a Objetos", code: "POO-1" });
      const bd = await createCohort(t, { name: "Banco de Dados", code: "BD-2026" });

      expect(ids(await client.get(`/api/cohorts?q=${encodeURIComponent("PROGRAMAÇÃO")}`))).toEqual([poo.id]);
      expect(ids(await client.get("/api/cohorts?q=programacao"))).toEqual([poo.id]);
      expect(ids(await client.get("/api/cohorts?q=bd-20"))).toEqual([bd.id]);
      expect(ids(await client.get("/api/cohorts?q=%25"))).toEqual([]);
      expect(ids(await client.get("/api/cohorts?q=funcional"))).toEqual([]);
    });

    it("filtra por ano e situação; o padrão omite arquivadas", async () => {
      const active = await createCohort(t, { academicYear: 2026 });
      const inactive = await createCohort(t, { academicYear: 2025, status: "INACTIVE" });
      const archived = await createCohort(t, { academicYear: 2026, status: "ARCHIVED" });

      expect(ids(await client.get("/api/cohorts")).sort()).toEqual([active.id, inactive.id].sort());
      expect(ids(await client.get("/api/cohorts?academicYear=2025"))).toEqual([inactive.id]);
      expect(ids(await client.get("/api/cohorts?status=ARCHIVED"))).toEqual([archived.id]);
      expect(ids(await client.get("/api/cohorts?status=ACTIVE&academicYear=2026"))).toEqual([active.id]);
      expect((await client.get("/api/cohorts?academicYear=abc")).status).toBe(400);
      expect((await client.get("/api/cohorts?status=DELETED")).status).toBe(400);
      expect((await client.get("/api/cohorts?cursor=nao-e-um-cursor")).status).toBe(400);
      expect((await client.get("/api/cohorts?teacherId=x")).status).toBe(400);
    });

    it("mais recentes primeiro, 20 por página, com cursor", async () => {
      const base = Date.now() - 100_000;
      const created = [];
      for (let i = 0; i < 23; i += 1) created.push(await createCohort(t, { createdAt: new Date(base + i * 1000) }));
      const expected = created.map((row) => row.id).reverse();

      const first = await client.get("/api/cohorts");
      expect(ids(first)).toEqual(expected.slice(0, 20));
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await client.get(`/api/cohorts?cursor=${encodeURIComponent(first.body.nextCursor)}`);
      expect(ids(second)).toEqual(expected.slice(20));
      expect(second.body.nextCursor).toBeNull();
    });

    it("conta só as matrículas ativas", async () => {
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const row = await createClass(t, teacher.id);
      const student = await createUser(t, { name: "Aluna" });
      const removed = await createUser(t, { name: "Aluno Removido" });
      await createEnrollment(t, row.id, student.id);
      const old = await createEnrollment(t, row.id, removed.id);
      await t.prisma.enrollment.update({ where: { id: old.id }, data: { status: "REMOVED", removedAt: new Date(), removalReason: "MANAGER" } });

      expect((await client.get("/api/cohorts")).body.items[0].activeEnrollmentCount).toBe(1);
      expect((await client.get(`/api/cohorts/${row.cohortId}`)).body.activeEnrollmentCount).toBe(1);
    });
  });

  describe("003/US1-3 editar turma", () => {
    it("salva os campos enviados e audita só os nomes dos campos alterados", async () => {
      const row = await createCohort(t, { name: "Algoritmos", code: "ALG-1", period: "manhã" });
      const res = await client.patch(`/api/cohorts/${row.id}`, {
        name: "Algoritmos Avançados",
        period: null,
        description: "Nova descrição",
        academicYear: row.academicYear,
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: row.id, name: "Algoritmos Avançados", code: "ALG-1", period: null, description: "Nova descrição", status: "ACTIVE" });
      expect((await t.prisma.cohort.findUniqueOrThrow({ where: { id: row.id } })).searchKey).toBe("algoritmos avancados alg-1");

      const [event] = await events("cohort.updated");
      expect(event).toMatchObject({ actorUserId: manager.id, targetType: "COHORT", targetId: row.id });
      expect((event!.metadata as { fields: string[] }).fields.sort()).toEqual(["description", "name", "period"]);
      expect(JSON.stringify(event!.metadata)).not.toContain("Avançados");
    });

    it("edita turma inativa", async () => {
      const row = await createCohort(t, { status: "INACTIVE" });
      const res = await client.patch(`/api/cohorts/${row.id}`, { code: "NOVO-1" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ code: "NOVO-1", status: "INACTIVE" });
    });

    it.each([
      ["responsável", { teacherId: crypto.randomUUID() }],
      ["situação", { status: "INACTIVE" }],
      ["corpo vazio", {}],
      ["nome vazio", { name: "" }],
    ])("%s no corpo → 400 e nada muda", async (_case, body) => {
      const row = await createCohort(t);
      const res = await client.patch(`/api/cohorts/${row.id}`, body);
      expect(res.status).toBe(400);
      expect(await t.prisma.cohort.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
      expect(await events("cohort.updated")).toEqual([]);
    });
  });

  describe("003/US1-4 código único no ano letivo, sem diferenciar maiúsculas (027/FR-002)", () => {
    it("criar ou editar com código repetido no mesmo ano → 409 COHORT_CODE_TAKEN", async () => {
      await createCohort(t, { code: "POO-2026-01" });
      const other = await createCohort(t, { code: "BD-1" });

      const created = await client.post("/api/cohorts", { ...VALID, code: "poo-2026-01" });
      expect(created.status).toBe(409);
      expect(created.body.code).toBe("COHORT_CODE_TAKEN");
      const edited = await client.patch(`/api/cohorts/${other.id}`, { code: "Poo-2026-01" });
      expect(edited.status).toBe(409);
      expect(edited.body.code).toBe("COHORT_CODE_TAKEN");
      expect(await t.prisma.cohort.count()).toBe(2);
      expect(await events("cohort.created")).toEqual([]);
      expect(await events("cohort.updated")).toEqual([]);
    });

    it("a própria turma pode manter o código mudando a caixa", async () => {
      const row = await createCohort(t, { code: "poo-1" });
      const res = await client.patch(`/api/cohorts/${row.id}`, { code: "POO-1" });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe("POO-1");
    });

    it("outro ano letivo pode usar o mesmo código", async () => {
      await createCohort(t, { code: "POO-2026-01", academicYear: 2025 });
      expect((await client.post("/api/cohorts", VALID)).status).toBe(201);
    });

    it("duas criações simultâneas com o mesmo código → uma turma", async () => {
      const results = await Promise.all([
        client.post("/api/cohorts", { ...VALID, code: "poo-2026-01" }),
        client.post("/api/cohorts", { ...VALID, code: "POO-2026-01" }),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(results.find((res) => res.status === 409)!.body.code).toBe("COHORT_CODE_TAKEN");
      expect(await t.prisma.cohort.count()).toBe(1);
      expect(await events("cohort.created")).toHaveLength(1);
    });
  });

  describe("003/US1-5 situação da turma", () => {
    it("ACTIVE → INACTIVE → ACTIVE, auditado; mesma situação → 200 sem efeito", async () => {
      const row = await createCohort(t);

      const inactive = await client.post(`/api/cohorts/${row.id}/status`, { to: "INACTIVE" });
      expect(inactive.status).toBe(200);
      expect(inactive.body.status).toBe("INACTIVE");
      const again = await client.post(`/api/cohorts/${row.id}/status`, { to: "INACTIVE" });
      expect(again.status).toBe(200);
      expect(again.body.status).toBe("INACTIVE");
      expect((await client.post(`/api/cohorts/${row.id}/status`, { to: "ACTIVE" })).body.status).toBe("ACTIVE");

      expect(await events("cohort.status_changed")).toMatchObject([
        { actorUserId: manager.id, targetType: "COHORT", targetId: row.id, metadata: { from: "ACTIVE", to: "INACTIVE" } },
        { metadata: { from: "INACTIVE", to: "ACTIVE" } },
      ]);
      expect((await t.prisma.cohort.findUniqueOrThrow({ where: { id: row.id } })).statusChangedAt).not.toBeNull();
    });

    it("arquivar cancela os convites pendentes na mesma operação e preserva as matrículas", async () => {
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const schoolClass = await createClass(t, teacher.id);
      const { invitation: pending } = await createClassInvitation(t, schoolClass.id, uniqueEmail("pendente"));
      const { invitation: cancelled } = await createClassInvitation(t, schoolClass.id, uniqueEmail("cancelado"), { status: "CANCELLED" });
      const student = await createUser(t, { name: "Aluna Matriculada" });
      const enrollment = await createEnrollment(t, schoolClass.id, student.id);

      const res = await client.post(`/api/cohorts/${schoolClass.cohortId}/status`, { to: "ARCHIVED" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "ARCHIVED", activeEnrollmentCount: 1 });

      expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
        status: "CANCELLED",
        cancelReason: "CLASS_ARCHIVED",
        cancelledById: manager.id,
        cancelledAt: expect.any(Date),
      });
      expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: cancelled.id } })).toEqual(cancelled);
      expect((await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("ACTIVE");
      expect(await events("cohort.status_changed")).toMatchObject([{ metadata: { from: "ACTIVE", to: "ARCHIVED", cancelledInvitations: 1 } }]);
    });

    it("ARCHIVED é final e não pode ser editada", async () => {
      const row = await createCohort(t, { status: "ARCHIVED" });
      for (const to of ["ACTIVE", "INACTIVE"]) {
        const res = await client.post(`/api/cohorts/${row.id}/status`, { to });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
      }
      const edit = await client.patch(`/api/cohorts/${row.id}`, { name: "Outro nome" });
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe("COHORT_ARCHIVED");
      expect(await t.prisma.cohort.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
      expect(await events("cohort.status_changed")).toEqual([]);
    });

    it("situação desconhecida ou campo extra → 400", async () => {
      const row = await createCohort(t);
      expect((await client.post(`/api/cohorts/${row.id}/status`, { to: "DELETED" })).status).toBe(400);
      expect((await client.post(`/api/cohorts/${row.id}/status`, { to: "INACTIVE", reason: "x" })).status).toBe(400);
    });
  });

  describe("003/US1-6 quem não é gestor e turma inexistente", () => {
    it("professor → 403 em todas as rotas da turma; turma inexistente → 404, sem efeito", async () => {
      const row = await createCohort(t);
      const teacher = await asUser(await createUser(t, { roles: ["TEACHER"], name: "Outro Professor" }));
      for (const res of [
        await teacher.get(`/api/cohorts/${row.id}`),
        await teacher.patch(`/api/cohorts/${row.id}`, { name: "Invadida" }),
        await teacher.post(`/api/cohorts/${row.id}/status`, { to: "ARCHIVED" }),
        await teacher.get("/api/cohorts"),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
      const unknown = crypto.randomUUID();
      for (const res of [
        await client.get(`/api/cohorts/${unknown}`),
        await client.patch(`/api/cohorts/${unknown}`, { name: "Invadida" }),
        await client.post(`/api/cohorts/${unknown}/status`, { to: "ARCHIVED" }),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("NOT_FOUND");
      }
      expect(await t.prisma.cohort.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
    });

    it("identificador inválido → 400", async () => {
      expect((await client.get("/api/cohorts/nao-e-uuid")).status).toBe(400);
    });
  });
});
