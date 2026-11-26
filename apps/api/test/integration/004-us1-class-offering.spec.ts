import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClass, createCohort, createSubject, createUser, dbDate, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const OFFERING = { startsOn: "2026-02-02", endsOn: "2026-06-30" };

/**
 * 004/US1 since 027: the offering of a subject is the disciplina da turma, created by the teacher on a MANAGER's turma
 * (`POST /classes { cohortId, subjectId, startsOn?, endsOn? }`); the subject and the turma never change (027/FR-019),
 * so the teacher edits only the calendar.
 */
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
    const cohort = await createCohort(t, { period: "2026.1" });
    const client = await asUser(teacher);

    const res = await client.post("/api/classes", { cohortId: cohort.id, subjectId: subject.id, ...OFFERING });
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

  it("004/FR-003 criar sem as datas é 201 e não planejável; turma migrada sem disciplina continua legível (027/FR-030)", async () => {
    const teacher = await newTeacher();
    const client = await asUser(teacher);
    const res = await client.post("/api/classes", {
      cohortId: (await createCohort(t)).id,
      subjectId: (await createSubject(t, teacher.id)).id,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ startsOn: null, endsOn: null, plannable: false });

    const legacy = await createClass(t, teacher.id);
    expect((await client.get(`/api/classes/${legacy.id}`)).body).toMatchObject({ subject: null, plannable: false });
    const withoutSubject = await client.post("/api/classes", { cohortId: (await createCohort(t)).id });
    expect(withoutSubject.status).toBe(400);
  });

  it("004/US1-4 turma antiga sem disciplina recebe datas, mas a disciplina não muda mais (027/FR-019)", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const legacy = await createClass(t, teacher.id, { period: "1º semestre" });
    const client = await asUser(teacher);

    expect((await client.patch(`/api/classes/${legacy.id}`, { subjectId: subject.id })).status).toBe(400);

    const dated = await client.patch(`/api/classes/${legacy.id}`, { startsOn: "2027-02-01", endsOn: "2027-06-30" });
    expect(dated.status).toBe(200);
    expect(dated.body).toMatchObject({ subject: null, startsOn: "2027-02-01", endsOn: "2027-06-30", plannable: false });

    const offering = await events("class.offering_updated");
    expect(offering.map((event) => event.metadata)).toEqual([
      // 031/FR-009: the count of days without class deleted with the change.
      { fields: ["startsOn", "endsOn"], subjectId: null, calendarDaysRemoved: 0 },
    ]);
    expect(offering[0]).toMatchObject({ actorUserId: teacher.id, targetType: "CLASS", targetId: legacy.id });
    expect(await events("class.updated")).toEqual([]);
  });

  it("004/US1-4 mudar as datas grava class.offering_updated; os campos da turma são recusados (400)", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...OFFERING });
    const client = await asUser(teacher);

    expect((await client.patch(`/api/classes/${schoolClass.id}`, { period: "2026.2", name: "Outro nome" })).status).toBe(400);
    expect((await client.patch(`/api/classes/${schoolClass.id}`, { startsOn: "2026-02-09", endsOn: "2026-06-30" })).status).toBe(200);
    expect((await events("class.offering_updated")).map((event) => event.metadata)).toEqual([
      { fields: ["startsOn"], subjectId: subject.id, calendarDaysRemoved: 0 },
    ]);

    expect((await client.patch(`/api/classes/${schoolClass.id}`, { startsOn: "2026-02-09", endsOn: "2026-06-30" })).status).toBe(200);
    expect(await events("class.offering_updated")).toHaveLength(1);
  });

  it("limpar as datas volta a turma a não planejável", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...OFFERING });
    const res = await (await asUser(teacher)).patch(`/api/classes/${schoolClass.id}`, { startsOn: null, endsOn: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subject: { id: subject.id }, startsOn: null, endsOn: null, plannable: false });
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
      const subject = await createSubject(t, teacher.id);
      const schoolClass = await createClass(t, teacher.id);
      const client = await asUser(teacher);

      const created = await client.post("/api/classes", { cohortId: (await createCohort(t)).id, subjectId: subject.id, ...dates });
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
    const client = await asUser(teacher);

    const created = await client.post("/api/classes", { cohortId: (await createCohort(t)).id, subjectId: inactive.id });
    expect(created.status).toBe(409);
    expect(created.body.code).toBe("SUBJECT_INACTIVE");

    const kept = await client.patch(`/api/classes/${linked.id}`, OFFERING);
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({ subject: { id: inactive.id }, plannable: true });
    expect(await t.prisma.schoolClass.count()).toBe(1);
  });

  it("disciplina de outro professor → 404 na criação e no filtro", async () => {
    const teacher = await newTeacher();
    const foreign = await createSubject(t, (await newTeacher("Outra")).id);
    await createClass(t, (await newTeacher("Terceira")).id, { subjectId: foreign.id });
    const cohort = await createCohort(t);
    const client = await asUser(teacher);

    for (const res of [
      await client.post("/api/classes", { cohortId: cohort.id, subjectId: foreign.id }),
      await client.post("/api/classes", { cohortId: cohort.id, subjectId: crypto.randomUUID() }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect(ids(await client.get(`/api/classes?subjectId=${foreign.id}`))).toEqual([]);
    expect(await t.prisma.schoolClass.count({ where: { cohortId: cohort.id } })).toBe(0);
  });

  it("turma arquivada é mostrada, mas não planejável", async () => {
    const teacher = await newTeacher();
    const subject = await createSubject(t, teacher.id);
    const archived = await createClass(t, teacher.id, { subjectId: subject.id, ...OFFERING, status: "ARCHIVED" });
    const res = await (await asUser(teacher)).get(`/api/classes/${archived.id}`);
    expect(res.body).toMatchObject({ subject: { id: subject.id }, plannable: false });
  });
});
