import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClass, createSubject, createUser, dbDate, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const CLASS = { name: "POO — Turma A", code: "POO-2026-A", academicYear: 2026 };
const OFFERING = { period: "2026.1", startsOn: "2026-02-02", endsOn: "2026-06-30" };

describe("004/US1 — turma como oferta da disciplina (FR-003)", () => {
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

  it("004/US1-3 cria turma ligada à disciplina, com período e datas; aparece na lista da disciplina", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id, { name: "Programação Orientada a Objetos" });
    const other = await createSubject(t, teacher.id, { name: "Banco de Dados" });
    await createClass(t, teacher.id, { subjectId: other.id });
    await createClass(t, teacher.id);
    const client = await asUser(teacher);

    const res = await client.post("/api/classes", { ...CLASS, ...OFFERING, subjectId: subject.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      subject: { id: subject.id, name: "Programação Orientada a Objetos" },
      period: "2026.1",
      startsOn: "2026-02-02",
      endsOn: "2026-06-30",
      plannable: true,
      planStatus: null,
    });
    const row = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ subjectId: subject.id, startsOn: dbDate("2026-02-02"), endsOn: dbDate("2026-06-30") });

    expect(ids(await client.get(`/api/classes?subjectId=${subject.id}`))).toEqual([row.id]);
    expect((await client.get(`/api/subjects/${subject.id}`)).body.classCount).toBe(1);
    expect((await client.get("/api/classes?subjectId=nao-uuid")).status).toBe(400);
    expect(await events("class.offering_updated")).toEqual([]);
  });

  it("004/FR-003 criar turma sem os campos novos continua 201 como na 003", async () => {
    const res = await (await asUser(await newTeacher())).post("/api/classes", CLASS);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ subject: null, startsOn: null, endsOn: null, plannable: false });
  });

  it("004/US1-4 turma antiga sem disciplina passa a ser planejável ao receber disciplina e datas", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const legacy = await createClass(t, teacher.id, { period: "1º semestre" });
    const client = await asUser(teacher);

    expect((await client.get(`/api/classes/${legacy.id}`)).body).toMatchObject({ subject: null, plannable: false });

    const onlySubject = await client.patch(`/api/classes/${legacy.id}`, { subjectId: subject.id });
    expect(onlySubject.status).toBe(200);
    expect(onlySubject.body).toMatchObject({ subject: { id: subject.id }, plannable: false });

    const dated = await client.patch(`/api/classes/${legacy.id}`, { startsOn: "2027-02-01", endsOn: "2027-06-30" });
    expect(dated.status).toBe(200);
    expect(dated.body).toMatchObject({ startsOn: "2027-02-01", endsOn: "2027-06-30", plannable: true });

    const offering = await events("class.offering_updated");
    expect(offering.map((event) => event.metadata)).toEqual([
      { fields: ["subjectId"], subjectId: subject.id },
      { fields: ["startsOn", "endsOn"], subjectId: subject.id },
    ]);
    expect(offering[0]).toMatchObject({ actorUserId: teacher.id, targetType: "CLASS", targetId: legacy.id });
    expect(await events("class.updated")).toEqual([]);
  });

  it("004/US1-4 mudar o período grava class.offering_updated; os demais campos seguem em class.updated", async () => {
    const teacher = await newTeacher();
    const schoolClass = await createClass(t, teacher.id, { period: "2026.1" });
    const client = await asUser(teacher);

    expect((await client.patch(`/api/classes/${schoolClass.id}`, { period: "2026.2", name: "Outro nome" })).status).toBe(200);
    expect((await events("class.offering_updated")).map((event) => event.metadata)).toEqual([
      { fields: ["period"], subjectId: null },
    ]);
    expect((await events("class.updated")).map((event) => event.metadata)).toEqual([{ fields: ["name", "period"] }]);

    expect((await client.patch(`/api/classes/${schoolClass.id}`, { period: "2026.2" })).status).toBe(200);
    expect(await events("class.offering_updated")).toHaveLength(1);
  });

  it("desligar a disciplina e as datas volta a turma a não planejável", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...OFFERING });
    const res = await (await asUser(teacher)).patch(`/api/classes/${schoolClass.id}`, {
      subjectId: null,
      startsOn: null,
      endsOn: null,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subject: null, startsOn: null, endsOn: null, plannable: false });
  });

  describe("004/US1-5 datas inválidas → 400", () => {
    it.each([
      ["término antes do início", { startsOn: "2026-06-30", endsOn: "2026-02-02" }],
      ["só a data de início", { startsOn: "2026-02-02" }],
      ["só a data de término", { endsOn: "2026-06-30" }],
      ["uma data e a outra nula", { startsOn: "2026-02-02", endsOn: null }],
      ["data inexistente", { startsOn: "2026-02-30", endsOn: "2026-06-30" }],
    ])("%s, na criação e na edição", async (_case, dates) => {
      const teacher = await newTeacher();
      const schoolClass = await createClass(t, teacher.id);
      const client = await asUser(teacher);

      const created = await client.post("/api/classes", { ...CLASS, ...dates });
      expect(created.status).toBe(400);
      expect(created.body.code).toBe("VALIDATION_ERROR");
      const updated = await client.patch(`/api/classes/${schoolClass.id}`, dates);
      expect(updated.status).toBe(400);
      expect(await t.prisma.schoolClass.count()).toBe(1);
    });
  });

  it("disciplina desativada → 409 SUBJECT_INACTIVE ao escolher; a turma que já a usa pode ser editada", async () => {
    const teacher = await newTeacher();
    const inactive = await createSubject(t, teacher.id, { status: "INACTIVE" });
    const linked = await createClass(t, teacher.id, { subjectId: inactive.id });
    const legacy = await createClass(t, teacher.id);
    const client = await asUser(teacher);

    const created = await client.post("/api/classes", { ...CLASS, subjectId: inactive.id });
    expect(created.status).toBe(409);
    expect(created.body.code).toBe("SUBJECT_INACTIVE");
    const updated = await client.patch(`/api/classes/${legacy.id}`, { subjectId: inactive.id });
    expect(updated.status).toBe(409);
    expect(updated.body.code).toBe("SUBJECT_INACTIVE");

    const kept = await client.patch(`/api/classes/${linked.id}`, { subjectId: inactive.id, ...OFFERING });
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({ subject: { id: inactive.id }, plannable: true });
    expect(await t.prisma.schoolClass.count()).toBe(2);
  });

  it("disciplina de outro professor → 404 na criação, na edição e no filtro", async () => {
    const teacher = await newTeacher();
    const foreign = await createSubject(t, (await newTeacher("Outra")).id);
    await createClass(t, (await newTeacher("Terceira")).id, { subjectId: foreign.id });
    const legacy = await createClass(t, teacher.id);
    const client = await asUser(teacher);

    for (const res of [
      await client.post("/api/classes", { ...CLASS, subjectId: foreign.id }),
      await client.patch(`/api/classes/${legacy.id}`, { subjectId: foreign.id }),
      await client.post("/api/classes", { ...CLASS, subjectId: crypto.randomUUID() }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect(ids(await client.get(`/api/classes?subjectId=${foreign.id}`))).toEqual([]);
    expect((await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: legacy.id } })).subjectId).toBeNull();
  });

  it("turma arquivada é mostrada, mas não planejável", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const archived = await createClass(t, teacher.id, { subjectId: subject.id, ...OFFERING, status: "ARCHIVED" });
    const res = await (await asUser(teacher)).get(`/api/classes/${archived.id}`);
    expect(res.body).toMatchObject({ subject: { id: subject.id }, plannable: false });
  });
});
