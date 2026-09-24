import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createClassInvitation,
  createEnrollment,
  createUser,
  loginAs,
  type TestUser,
  uniqueEmail,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const VALID = { name: "Programação Orientada a Objetos", code: "POO-2026-01", academicYear: 2026, period: "2º semestre" };

describe("003/US1 — professor cria e administra as próprias turmas (FR-001–FR-008)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  const newTeacher = (name = "Professora Teste") => createUser(t, { roles: ["TEACHER"], name });
  const asUser = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((item) => item.id);

  describe("003/US1-1 criar turma", () => {
    it("cria ACTIVE, do professor da sessão, visível na lista e auditada", async () => {
      const teacher = await newTeacher();
      const client = await asUser(teacher);

      const res = await client.post("/api/classes", { ...VALID, name: `  ${VALID.name}  `, description: "Turma da manhã" });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        name: VALID.name,
        code: VALID.code,
        academicYear: 2026,
        period: "2º semestre",
        description: "Turma da manhã",
        status: "ACTIVE",
        activeStudentCount: 0,
        // 004: a class created without the offering fields is not plannable.
        subject: null,
        startsOn: null,
        endsOn: null,
        plannable: false,
        planStatus: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const row = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.teacherId).toBe(teacher.id);
      expect(row.searchKey).toBe("programacao orientada a objetos poo-2026-01");

      expect(await events("class.created")).toMatchObject([
        {
          actorType: "USER",
          actorUserId: teacher.id,
          targetType: "CLASS",
          targetId: row.id,
          metadata: { code: VALID.code, academicYear: 2026 },
        },
      ]);

      const list = await client.get("/api/classes");
      expect(list.status).toBe(200);
      expect(ids(list)).toEqual([row.id]);
    });

    it("período e descrição são opcionais", async () => {
      const res = await (await asUser(await newTeacher())).post("/api/classes", {
        name: "Banco de Dados",
        code: "BD-1",
        academicYear: 2026,
      });
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
      const res = await (await asUser(await newTeacher())).post("/api/classes", body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(await t.prisma.schoolClass.count()).toBe(0);
    });
  });

  describe("003/US1-2 pesquisa, filtros e paginação", () => {
    it("pesquisa sem acento e sem maiúsculas, por nome ou código, só nas turmas do professor", async () => {
      const teacher = await newTeacher();
      const poo = await createClass(t, teacher.id, { name: "Programação Orientada a Objetos", code: "POO-1" });
      const bd = await createClass(t, teacher.id, { name: "Banco de Dados", code: "BD-2026" });
      const other = await newTeacher("Outro Professor");
      await createClass(t, other.id, { name: "Programação Funcional", code: "PF-1" });
      const client = await asUser(teacher);

      expect(ids(await client.get(`/api/classes?query=${encodeURIComponent("PROGRAMAÇÃO")}`))).toEqual([poo.id]);
      expect(ids(await client.get("/api/classes?query=programacao"))).toEqual([poo.id]);
      expect(ids(await client.get("/api/classes?query=bd-20"))).toEqual([bd.id]);
      expect(ids(await client.get("/api/classes?query=%25"))).toEqual([]);
      expect(ids(await client.get("/api/classes?query=funcional"))).toEqual([]);
    });

    it("filtra por ano e situação; o padrão omite arquivadas", async () => {
      const teacher = await newTeacher();
      const active = await createClass(t, teacher.id, { academicYear: 2026 });
      const inactive = await createClass(t, teacher.id, { academicYear: 2025, status: "INACTIVE" });
      const archived = await createClass(t, teacher.id, { academicYear: 2026, status: "ARCHIVED" });
      const client = await asUser(teacher);

      expect(ids(await client.get("/api/classes")).sort()).toEqual([active.id, inactive.id].sort());
      expect(ids(await client.get("/api/classes?year=2025"))).toEqual([inactive.id]);
      expect(ids(await client.get("/api/classes?status=ARCHIVED"))).toEqual([archived.id]);
      expect(ids(await client.get("/api/classes?status=ACTIVE&year=2026"))).toEqual([active.id]);
      expect((await client.get("/api/classes?year=abc")).status).toBe(400);
      expect((await client.get("/api/classes?status=DELETED")).status).toBe(400);
      expect((await client.get("/api/classes?cursor=nao-e-um-cursor")).status).toBe(400);
      expect((await client.get("/api/classes?teacherId=x")).status).toBe(400);
    });

    it("mais recentes primeiro, 20 por página, com cursor", async () => {
      const teacher = await newTeacher();
      const base = Date.now() - 100_000;
      const created = [];
      for (let i = 0; i < 23; i += 1) {
        created.push(await createClass(t, teacher.id, { createdAt: new Date(base + i * 1000) }));
      }
      const expected = created.map((row) => row.id).reverse();
      const client = await asUser(teacher);

      const first = await client.get("/api/classes");
      expect(ids(first)).toEqual(expected.slice(0, 20));
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await client.get(`/api/classes?cursor=${encodeURIComponent(first.body.nextCursor)}`);
      expect(ids(second)).toEqual(expected.slice(20));
      expect(second.body.nextCursor).toBeNull();
    });

    it("conta só as matrículas ativas", async () => {
      const teacher = await newTeacher();
      const row = await createClass(t, teacher.id);
      const student = await createUser(t, { name: "Aluna" });
      const removed = await createUser(t, { name: "Aluno Removido" });
      await createEnrollment(t, row.id, student.id);
      const old = await createEnrollment(t, row.id, removed.id);
      await t.prisma.enrollment.update({ where: { id: old.id }, data: { status: "REMOVED", removedAt: new Date() } });
      const client = await asUser(teacher);

      expect((await client.get("/api/classes")).body.items[0].activeStudentCount).toBe(1);
      expect((await client.get(`/api/classes/${row.id}`)).body.activeStudentCount).toBe(1);
    });
  });

  describe("003/US1-3 editar turma", () => {
    it("salva os campos enviados e audita só os nomes dos campos alterados", async () => {
      const teacher = await newTeacher();
      const row = await createClass(t, teacher.id, { name: "Algoritmos", code: "ALG-1", period: "manhã" });
      const client = await asUser(teacher);

      const res = await client.patch(`/api/classes/${row.id}`, {
        name: "Algoritmos Avançados",
        period: null,
        description: "Nova descrição",
        academicYear: row.academicYear,
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: row.id,
        name: "Algoritmos Avançados",
        code: "ALG-1",
        period: null,
        description: "Nova descrição",
        status: "ACTIVE",
      });
      const saved = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: row.id } });
      expect(saved.searchKey).toBe("algoritmos avancados alg-1");

      const [event] = await events("class.updated");
      expect(event).toMatchObject({ actorUserId: teacher.id, targetType: "CLASS", targetId: row.id });
      expect((event!.metadata as { fields: string[] }).fields.sort()).toEqual(["description", "name", "period"]);
      expect(JSON.stringify(event!.metadata)).not.toContain("Avançados");
    });

    it("edita turma inativa", async () => {
      const teacher = await newTeacher();
      const row = await createClass(t, teacher.id, { status: "INACTIVE" });
      const res = await (await asUser(teacher)).patch(`/api/classes/${row.id}`, { code: "NOVO-1" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ code: "NOVO-1", status: "INACTIVE" });
    });

    it.each([
      ["responsável", { teacherId: crypto.randomUUID() }],
      ["situação", { status: "INACTIVE" }],
      ["corpo vazio", {}],
      ["nome vazio", { name: "" }],
    ])("%s no corpo → 400 e nada muda", async (_case, body) => {
      const teacher = await newTeacher();
      const row = await createClass(t, teacher.id);
      const res = await (await asUser(teacher)).patch(`/api/classes/${row.id}`, body);
      expect(res.status).toBe(400);
      expect(await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
      expect(await events("class.updated")).toEqual([]);
    });
  });

  describe("003/US1-4 código único por professor, sem diferenciar maiúsculas", () => {
    it("criar ou editar com código repetido → 409 CLASS_CODE_TAKEN", async () => {
      const teacher = await newTeacher();
      await createClass(t, teacher.id, { code: "POO-2026-01" });
      const other = await createClass(t, teacher.id, { code: "BD-1" });
      const client = await asUser(teacher);

      const created = await client.post("/api/classes", { ...VALID, code: "poo-2026-01" });
      expect(created.status).toBe(409);
      expect(created.body.code).toBe("CLASS_CODE_TAKEN");

      const edited = await client.patch(`/api/classes/${other.id}`, { code: "Poo-2026-01" });
      expect(edited.status).toBe(409);
      expect(edited.body.code).toBe("CLASS_CODE_TAKEN");
      expect(await t.prisma.schoolClass.count()).toBe(2);
      expect(await events("class.created")).toEqual([]);
      expect(await events("class.updated")).toEqual([]);
    });

    it("a própria turma pode manter o código mudando a caixa", async () => {
      const teacher = await newTeacher();
      const row = await createClass(t, teacher.id, { code: "poo-1" });
      const res = await (await asUser(teacher)).patch(`/api/classes/${row.id}`, { code: "POO-1" });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe("POO-1");
    });

    it("outro professor pode usar o mesmo código", async () => {
      await createClass(t, (await newTeacher()).id, { code: "POO-2026-01" });
      expect((await (await asUser(await newTeacher("Outra"))).post("/api/classes", VALID)).status).toBe(201);
    });

    it("duas criações simultâneas com o mesmo código → uma turma", async () => {
      const client = await asUser(await newTeacher());
      const results = await Promise.all([
        client.post("/api/classes", { ...VALID, code: "poo-2026-01" }),
        client.post("/api/classes", { ...VALID, code: "POO-2026-01" }),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(results.find((res) => res.status === 409)!.body.code).toBe("CLASS_CODE_TAKEN");
      expect(await t.prisma.schoolClass.count()).toBe(1);
      expect(await events("class.created")).toHaveLength(1);
    });
  });

  describe("003/US1-5 situação da turma", () => {
    it("ACTIVE → INACTIVE → ACTIVE, auditado; mesma situação → 200 sem efeito", async () => {
      const teacher = await newTeacher();
      const row = await createClass(t, teacher.id);
      const client = await asUser(teacher);

      const inactive = await client.post(`/api/classes/${row.id}/status`, { status: "INACTIVE" });
      expect(inactive.status).toBe(200);
      expect(inactive.body.status).toBe("INACTIVE");
      const again = await client.post(`/api/classes/${row.id}/status`, { status: "INACTIVE" });
      expect(again.status).toBe(200);
      expect(again.body.status).toBe("INACTIVE");
      const active = await client.post(`/api/classes/${row.id}/status`, { status: "ACTIVE" });
      expect(active.body.status).toBe("ACTIVE");

      expect(await events("class.status_changed")).toMatchObject([
        { actorUserId: teacher.id, targetType: "CLASS", targetId: row.id, metadata: { from: "ACTIVE", to: "INACTIVE" } },
        { metadata: { from: "INACTIVE", to: "ACTIVE" } },
      ]);
      const saved = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: row.id } });
      expect(saved.statusChangedAt).not.toBeNull();
    });

    it("arquivar cancela os convites pendentes na mesma operação e preserva as matrículas", async () => {
      const teacher = await newTeacher();
      const row = await createClass(t, teacher.id);
      const { invitation: pending } = await createClassInvitation(t, row.id, uniqueEmail("pendente"));
      const { invitation: cancelled } = await createClassInvitation(t, row.id, uniqueEmail("cancelado"), {
        status: "CANCELLED",
      });
      const student = await createUser(t, { name: "Aluna Matriculada" });
      const enrollment = await createEnrollment(t, row.id, student.id);
      const client = await asUser(teacher);

      const res = await client.post(`/api/classes/${row.id}/status`, { status: "ARCHIVED" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "ARCHIVED", activeStudentCount: 1 });

      expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
        status: "CANCELLED",
        cancelReason: "CLASS_ARCHIVED",
        cancelledById: teacher.id,
        cancelledAt: expect.any(Date),
      });
      expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: cancelled.id } })).toEqual(cancelled);
      expect((await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("ACTIVE");
      expect(await events("class.status_changed")).toMatchObject([
        { metadata: { from: "ACTIVE", to: "ARCHIVED", cancelledInvitations: 1 } },
      ]);
    });

    it("ARCHIVED é final e não pode ser editada", async () => {
      const teacher = await newTeacher();
      const row = await createClass(t, teacher.id, { status: "ARCHIVED" });
      const client = await asUser(teacher);

      for (const status of ["ACTIVE", "INACTIVE"]) {
        const res = await client.post(`/api/classes/${row.id}/status`, { status });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
      }
      const edit = await client.patch(`/api/classes/${row.id}`, { name: "Outro nome" });
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe("INVALID_STATE_TRANSITION");
      expect(await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
      expect(await events("class.status_changed")).toEqual([]);
    });

    it("situação desconhecida ou campo extra → 400", async () => {
      const teacher = await newTeacher();
      const row = await createClass(t, teacher.id);
      const client = await asUser(teacher);
      expect((await client.post(`/api/classes/${row.id}/status`, { status: "DELETED" })).status).toBe(400);
      expect((await client.post(`/api/classes/${row.id}/status`, { status: "INACTIVE", reason: "x" })).status).toBe(400);
    });
  });

  describe("003/US1-6 turma de outro professor", () => {
    it("GET, PATCH e status → 404, como uma turma inexistente, sem efeito", async () => {
      const owner = await newTeacher("Dona da Turma");
      const row = await createClass(t, owner.id);
      const intruder = await asUser(await newTeacher("Outro Professor"));

      for (const id of [row.id, crypto.randomUUID()]) {
        const responses = [
          await intruder.get(`/api/classes/${id}`),
          await intruder.patch(`/api/classes/${id}`, { name: "Invadida" }),
          await intruder.post(`/api/classes/${id}/status`, { status: "ARCHIVED" }),
        ];
        for (const res of responses) {
          expect(res.status).toBe(404);
          expect(res.body.code).toBe("NOT_FOUND");
        }
      }
      expect(await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
      expect(ids(await intruder.get("/api/classes"))).toEqual([]);
    });

    it("identificador inválido → 400", async () => {
      expect((await (await asUser(await newTeacher())).get("/api/classes/nao-e-uuid")).status).toBe(400);
    });
  });
});
