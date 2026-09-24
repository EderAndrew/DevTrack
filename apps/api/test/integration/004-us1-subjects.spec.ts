import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClass, createSubject, createSyllabusDocument, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const POO = { name: "Programação Orientada a Objetos", description: "Classes, objetos e padrões." };

describe("004/US1 — professor organiza as próprias disciplinas (FR-001, FR-002)", () => {
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

  describe("004/US1-1 criar disciplina", () => {
    it("cria ACTIVE, do professor da sessão, visível na lista e auditada sem o nome", async () => {
      const teacher = await newTeacher();
      const client = await asUser(teacher);

      const res = await client.post("/api/subjects", { ...POO, name: `  ${POO.name}  ` });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        name: POO.name,
        description: POO.description,
        status: "ACTIVE",
        classCount: 0,
        documentCount: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const row = await t.prisma.subject.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row).toMatchObject({ teacherId: teacher.id, searchKey: "programacao orientada a objetos" });

      const created = await events("subject.created");
      expect(created).toMatchObject([
        { actorType: "USER", actorUserId: teacher.id, targetType: "SUBJECT", targetId: row.id },
      ]);
      expect(JSON.stringify(created[0]!.metadata ?? {})).not.toContain("Programação");

      expect(ids(await client.get("/api/subjects"))).toEqual([row.id]);
      expect((await client.get(`/api/subjects/${row.id}`)).body).toEqual(res.body);
    });

    it("descrição é opcional; vazia vira null", async () => {
      const client = await asUser(await newTeacher());
      expect((await client.post("/api/subjects", { name: "Algoritmos" })).body).toMatchObject({ description: null });
      expect((await client.post("/api/subjects", { name: "Redes", description: "  " })).body).toMatchObject({
        description: null,
      });
    });

    it.each([
      ["sem nome", { name: "  " }],
      ["nome longo", { name: "n".repeat(121) }],
      ["descrição longa", { name: "Algoritmos", description: "d".repeat(1001) }],
      ["responsável no corpo", { name: "Algoritmos", teacherId: crypto.randomUUID() }],
      ["situação no corpo", { name: "Algoritmos", status: "INACTIVE" }],
    ])("%s → 400 e nada criado", async (_case, body) => {
      const res = await (await asUser(await newTeacher())).post("/api/subjects", body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(await t.prisma.subject.count()).toBe(0);
    });
  });

  describe("004/US1-2 nome único por professor, ignorando caixa e espaços", () => {
    it("criar com o mesmo nome em outra caixa → 409 SUBJECT_NAME_TAKEN", async () => {
      const teacher = await newTeacher();
      await createSubject(t, teacher.id, { name: "Algoritmos" });
      const res = await (await asUser(teacher)).post("/api/subjects", { name: "algoritmos " });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ statusCode: 409, code: "SUBJECT_NAME_TAKEN" });
      expect(await t.prisma.subject.count()).toBe(1);
      expect(await events("subject.created")).toEqual([]);
    });

    it("renomear para o nome de outra disciplina → 409; mudar só a caixa da própria → 200", async () => {
      const teacher = await newTeacher();
      await createSubject(t, teacher.id, { name: "Algoritmos" });
      const other = await createSubject(t, teacher.id, { name: "Estruturas de Dados" });
      const client = await asUser(teacher);

      const taken = await client.patch(`/api/subjects/${other.id}`, { name: " ALGORITMOS" });
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe("SUBJECT_NAME_TAKEN");
      expect((await t.prisma.subject.findUniqueOrThrow({ where: { id: other.id } })).name).toBe("Estruturas de Dados");

      const recased = await client.patch(`/api/subjects/${other.id}`, { name: "estruturas de dados" });
      expect(recased.status).toBe(200);
      expect(recased.body.name).toBe("estruturas de dados");
    });

    it("outro professor pode usar o mesmo nome", async () => {
      await createSubject(t, (await newTeacher()).id, { name: "Algoritmos" });
      expect((await (await asUser(await newTeacher("Outra"))).post("/api/subjects", { name: "Algoritmos" })).status).toBe(
        201,
      );
    });

    it("duas criações simultâneas com o mesmo nome → uma disciplina", async () => {
      const client = await asUser(await newTeacher());
      const results = await Promise.all([
        client.post("/api/subjects", { name: "Algoritmos" }),
        client.post("/api/subjects", { name: "ALGORITMOS" }),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(results.find((res) => res.status === 409)!.body.code).toBe("SUBJECT_NAME_TAKEN");
      expect(await t.prisma.subject.count()).toBe(1);
      expect(await events("subject.created")).toHaveLength(1);
    });
  });

  describe("004/FR-002 editar disciplina", () => {
    it("salva os campos enviados e audita só os nomes dos campos alterados", async () => {
      const teacher = await newTeacher();
      const subject = await createSubject(t, teacher.id, { name: "Algoritmos", description: "Antiga" });
      const client = await asUser(teacher);

      const res = await client.patch(`/api/subjects/${subject.id}`, { name: "Algoritmos Avançados", description: "Antiga" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: subject.id, name: "Algoritmos Avançados", description: "Antiga" });
      expect((await t.prisma.subject.findUniqueOrThrow({ where: { id: subject.id } })).searchKey).toBe(
        "algoritmos avancados",
      );

      const [event] = await events("subject.updated");
      expect(event).toMatchObject({ actorUserId: teacher.id, targetType: "SUBJECT", targetId: subject.id });
      expect(event!.metadata).toEqual({ fields: ["name"] });
      expect(JSON.stringify(event!.metadata)).not.toContain("Avançados");
    });

    it("sem mudança → 200 sem auditoria; corpo vazio → 400", async () => {
      const teacher = await newTeacher();
      const subject = await createSubject(t, teacher.id, { name: "Algoritmos" });
      const client = await asUser(teacher);
      expect((await client.patch(`/api/subjects/${subject.id}`, { name: "Algoritmos" })).status).toBe(200);
      expect(await events("subject.updated")).toEqual([]);
      expect((await client.patch(`/api/subjects/${subject.id}`, {})).status).toBe(400);
    });
  });

  describe("004/US1-6 desativar e reativar", () => {
    it("ACTIVE → INACTIVE → ACTIVE, auditado com status; mesma situação → 200 sem efeito; turmas intactas", async () => {
      const teacher = await newTeacher();
      const subject = await createSubject(t, teacher.id);
      const schoolClass = await createClass(t, teacher.id, {
        subjectId: subject.id,
        startsOn: "2027-02-01",
        endsOn: "2027-06-30",
      });
      const client = await asUser(teacher);

      const inactive = await client.post(`/api/subjects/${subject.id}/status`, { status: "INACTIVE" });
      expect(inactive.status).toBe(200);
      expect(inactive.body).toMatchObject({ status: "INACTIVE", classCount: 1 });
      expect((await client.post(`/api/subjects/${subject.id}/status`, { status: "INACTIVE" })).status).toBe(200);

      const offering = await client.get(`/api/classes/${schoolClass.id}`);
      expect(offering.body).toMatchObject({ subject: { id: subject.id }, plannable: true, status: "ACTIVE" });

      expect((await client.post(`/api/subjects/${subject.id}/status`, { status: "ACTIVE" })).body.status).toBe("ACTIVE");
      expect((await events("subject.updated")).map((event) => event.metadata)).toEqual([
        { fields: ["status"], status: "INACTIVE" },
        { fields: ["status"], status: "ACTIVE" },
      ]);
      expect((await client.post(`/api/subjects/${subject.id}/status`, { status: "ARCHIVED" })).status).toBe(400);
    });
  });

  describe("004/FR-001 lista: pesquisa, filtro, ordem e cursor", () => {
    it("pesquisa sem acento e sem maiúsculas, só nas disciplinas do professor", async () => {
      const teacher = await newTeacher();
      const poo = await createSubject(t, teacher.id, { name: "Programação Orientada a Objetos" });
      await createSubject(t, teacher.id, { name: "Banco de Dados" });
      await createSubject(t, (await newTeacher("Outro")).id, { name: "Programação Funcional" });
      const client = await asUser(teacher);

      expect(ids(await client.get(`/api/subjects?query=${encodeURIComponent("PROGRAMAÇÃO")}`))).toEqual([poo.id]);
      expect(ids(await client.get("/api/subjects?query=orientada"))).toEqual([poo.id]);
      expect(ids(await client.get("/api/subjects?query=%25"))).toEqual([]);
      expect(ids(await client.get("/api/subjects?query=funcional"))).toEqual([]);
    });

    it("filtra por situação; sem filtro lista as duas; parâmetros inválidos → 400", async () => {
      const teacher = await newTeacher();
      const active = await createSubject(t, teacher.id, { name: "Algoritmos" });
      const inactive = await createSubject(t, teacher.id, { name: "Banco de Dados", status: "INACTIVE" });
      const client = await asUser(teacher);

      expect(ids(await client.get("/api/subjects"))).toEqual([active.id, inactive.id]);
      expect(ids(await client.get("/api/subjects?status=INACTIVE"))).toEqual([inactive.id]);
      expect(ids(await client.get("/api/subjects?status=ACTIVE"))).toEqual([active.id]);
      expect((await client.get("/api/subjects?status=ARCHIVED")).status).toBe(400);
      expect((await client.get("/api/subjects?cursor=nao-e-um-cursor")).status).toBe(400);
      expect((await client.get("/api/subjects?teacherId=x")).status).toBe(400);
    });

    it("ordem por nome (sem acento), 50 por página, com cursor", async () => {
      const teacher = await newTeacher();
      const names = Array.from({ length: 52 }, (_, index) => `Disciplina ${String(index).padStart(2, "0")}`);
      for (const name of [...names].reverse()) await createSubject(t, teacher.id, { name });
      await createSubject(t, teacher.id, { name: "Álgebra" });
      const client = await asUser(teacher);

      const first = await client.get("/api/subjects");
      expect(first.body.items).toHaveLength(50);
      expect(first.body.items.map((item: { name: string }) => item.name)).toEqual(["Álgebra", ...names.slice(0, 49)]);
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await client.get(`/api/subjects?cursor=${encodeURIComponent(first.body.nextCursor)}`);
      expect(second.body.items.map((item: { name: string }) => item.name)).toEqual(names.slice(49));
      expect(second.body.nextCursor).toBeNull();
    });

    it("contagem de turmas e de versões da ementa", async () => {
      const teacher = await newTeacher();
      const subject = await createSubject(t, teacher.id);
      await createClass(t, teacher.id, { subjectId: subject.id });
      await createClass(t, teacher.id, { subjectId: subject.id, status: "ARCHIVED" });
      await createClass(t, teacher.id);
      await createSyllabusDocument(t, subject.id);
      const res = await (await asUser(teacher)).get(`/api/subjects/${subject.id}`);
      expect(res.body).toMatchObject({ classCount: 2, documentCount: 1 });
    });
  });

  describe("004/FR-002 sem exclusão e contexto do professor", () => {
    it("não existe rota de exclusão", async () => {
      const teacher = await newTeacher();
      const subject = await createSubject(t, teacher.id);
      const res = await (await asUser(teacher)).delete(`/api/subjects/${subject.id}`);
      expect(res.status).toBe(404);
      expect(await t.prisma.subject.count()).toBe(1);
    });

    it("disciplina de outro professor → 404 em GET, PATCH e status, sem alterar nada", async () => {
      const owner = await newTeacher();
      const subject = await createSubject(t, owner.id, { name: "Algoritmos" });
      const intruder = await asUser(await newTeacher("Intrusa"));

      for (const res of [
        await intruder.get(`/api/subjects/${subject.id}`),
        await intruder.patch(`/api/subjects/${subject.id}`, { name: "Outro" }),
        await intruder.post(`/api/subjects/${subject.id}/status`, { status: "INACTIVE" }),
        await intruder.get(`/api/subjects/${crypto.randomUUID()}`),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("NOT_FOUND");
      }
      expect(ids(await intruder.get("/api/subjects"))).toEqual([]);
      expect(await t.prisma.subject.findUniqueOrThrow({ where: { id: subject.id } })).toMatchObject({
        name: "Algoritmos",
        status: "ACTIVE",
      });
      expect(await events("subject.updated")).toEqual([]);
    });

    it("administrador sem papel de professor → 403", async () => {
      const admin = await createUser(t, { roles: ["ADMIN"] });
      const client = await asUser(admin);
      expect((await client.get("/api/subjects")).status).toBe(403);
      expect((await client.post("/api/subjects", { name: "Algoritmos" })).status).toBe(403);
    });
  });
});
