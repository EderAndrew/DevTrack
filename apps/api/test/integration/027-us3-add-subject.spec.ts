import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createCohort,
  createEnrollment,
  createSubject,
  createUser,
  dbDate,
  loginAs,
  type TestUser,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** The keys of a directory item (027/FR-016): what identifies a turma and who teaches what, nothing else. */
const DIRECTORY_ITEM_KEYS = ["academicYear", "classes", "code", "id", "name", "period"];

describe("027/US3 — professor encontra a turma e acrescenta a sua disciplina (FR-016–FR-020)", () => {
  let t: TestApp;
  let teacher: TestUser;
  let client: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ana" });
    client = await asUser(teacher);
  });

  const asUser = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const search = (q: string, as = client) => as.get(`/api/cohort-directory?q=${encodeURIComponent(q)}`);

  it("027/US3-1 a busca acha só turmas ativas por parte do nome ou do código, sem acento nem caixa, e mostra só o mínimo", async () => {
    const active = await createCohort(t, { name: "Análise e Desenvolvimento 3NA", code: "ADS-3NA", period: "Noturno" });
    await createCohort(t, { name: "Análise e Desenvolvimento 3NB", code: "ADS-3NB", status: "INACTIVE" });
    await createCohort(t, { name: "Análise e Desenvolvimento 3NC", code: "ADS-3NC", status: "ARCHIVED" });
    await createCohort(t, { name: "Redes 1", code: "RED-1" });
    const other = await createUser(t, { roles: ["TEACHER"], name: "Professor Beto" });
    const theirClass = await createClass(t, other.id, {
      cohortId: active.id,
      subjectId: (await createSubject(t, other.id, { name: "Redes" })).id,
    });
    await createEnrollment(t, theirClass.id, (await createUser(t, { roles: ["STUDENT"] })).id);

    for (const q of ["analise", "ANÁLISE", "3na", "ads-3"]) {
      const res = await search(q);
      expect(res.status).toBe(200);
      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([active.id]);
    }
    const [item] = (await search("ads")).body.items;
    expect(Object.keys(item).sort()).toEqual(DIRECTORY_ITEM_KEYS);
    expect(item).toEqual({
      id: active.id,
      name: "Análise e Desenvolvimento 3NA",
      code: "ADS-3NA",
      academicYear: 2026,
      period: "Noturno",
      classes: [{ subjectName: "Redes", teacherName: "Professor Beto" }],
    });

    // Paging: 20 per page, most recent year first, then name.
    for (let index = 0; index < 21; index += 1) {
      await createCohort(t, { name: `Paginada ${String(index).padStart(2, "0")}`, code: `PAG-${index}`, academicYear: 2025 + (index % 2) });
    }
    const first = await search("paginada");
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0].academicYear).toBe(2026);
    const second = await client.get(`/api/cohort-directory?q=paginada&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    const all = [...first.body.items, ...second.body.items].map((cohort: { name: string; academicYear: number }) => cohort);
    expect(new Set(all.map((cohort) => cohort.name)).size).toBe(21);
    expect(all.map((cohort) => cohort.academicYear)).toEqual([...all.map((cohort) => cohort.academicYear)].sort((a, b) => b - a));

    expect((await client.get("/api/cohort-directory?q=")).status).toBe(400);
    expect((await client.get(`/api/cohort-directory?q=${"x".repeat(101)}`)).status).toBe(400);
    expect((await client.get("/api/cohort-directory?q=ads&cursor=lixo")).status).toBe(400);
  });

  it("027/US3-2 acrescentar uma disciplina ativa própria a uma turma ativa: nasce ativa, do professor, com os alunos da turma, e é auditada", async () => {
    const cohort = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA", period: "2026.2" });
    const subject = await createSubject(t, teacher.id, { name: "Banco de Dados" });
    const student = await createUser(t, { roles: ["STUDENT"] });
    await t.prisma.enrollment.create({ data: { cohortId: cohort.id, studentUserId: student.id, status: "ACTIVE", enrolledAt: new Date() } });

    const res = await client.post("/api/classes", {
      cohortId: cohort.id,
      subjectId: subject.id,
      startsOn: "2026-08-03",
      endsOn: "2026-12-11",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "ADS 3NA",
      subject: { id: subject.id, name: "Banco de Dados" },
      cohort: { id: cohort.id, name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026, period: "2026.2" },
      status: "ACTIVE",
      ownStatus: "ACTIVE",
      effectiveStatus: "ACTIVE",
      canChangeStatus: false,
      activeStudentCount: 1,
      startsOn: "2026-08-03",
      endsOn: "2026-12-11",
      plannable: true,
      planStatus: null,
    });
    const row = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({
      teacherId: teacher.id,
      cohortId: cohort.id,
      subjectId: subject.id,
      status: "ACTIVE",
      startsOn: dbDate("2026-08-03"),
      endsOn: dbDate("2026-12-11"),
    });
    expect(await events("class.created")).toMatchObject([
      {
        actorType: "USER",
        actorUserId: teacher.id,
        targetType: "CLASS",
        targetId: row.id,
        metadata: { cohortId: cohort.id, subjectId: subject.id },
      },
    ]);

    const list = await client.get("/api/classes");
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([row.id]);
    expect((await client.get(`/api/classes/${row.id}/enrollments`)).body.items).toHaveLength(1);
    expect((await search("ads")).body.items[0].classes).toEqual([{ subjectName: "Banco de Dados", teacherName: "Professora Ana" }]);

    // Without a calendar: dates are optional (004 rules), so it is not plannable yet.
    const other = await client.post("/api/classes", {
      cohortId: (await createCohort(t)).id,
      subjectId: subject.id,
    });
    expect(other.status).toBe(201);
    expect(other.body).toMatchObject({ startsOn: null, endsOn: null, plannable: false });
  });

  it("027/US3-3 a mesma disciplina na mesma turma de novo → 409 CLASS_SUBJECT_DUPLICATE, nada criado", async () => {
    const cohort = await createCohort(t);
    const subject = await createSubject(t, teacher.id);
    expect((await client.post("/api/classes", { cohortId: cohort.id, subjectId: subject.id })).status).toBe(201);

    const again = await client.post("/api/classes", { cohortId: cohort.id, subjectId: subject.id });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("CLASS_SUBJECT_DUPLICATE");
    expect(await t.prisma.schoolClass.count()).toBe(1);
    expect(await events("class.created")).toHaveLength(1);
  });

  it("027/US3-4 a mesma disciplina em outra turma é outra disciplina da turma, independente", async () => {
    const subject = await createSubject(t, teacher.id, { name: "Banco de Dados" });
    const first = await client.post("/api/classes", { cohortId: (await createCohort(t, { name: "ADS 3NA" })).id, subjectId: subject.id });
    const second = await client.post("/api/classes", { cohortId: (await createCohort(t, { name: "ADS 3NB" })).id, subjectId: subject.id });
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.id).not.toBe(second.body.id);

    await t.prisma.classMeeting.create({ data: { classId: first.body.id, meetingDate: dbDate("2026-08-10") } });
    expect(await t.prisma.classMeeting.count({ where: { classId: second.body.id } })).toBe(0);
    const names = (await client.get("/api/classes")).body.items.map((item: { cohort: { name: string } }) => item.cohort.name);
    expect(names.sort()).toEqual(["ADS 3NA", "ADS 3NB"]);
  });

  it("027/US3-5 outro professor acrescenta a sua disciplina na mesma turma; cada um só vê a sua", async () => {
    const cohort = await createCohort(t, { name: "ADS 3NA" });
    const mine = await client.post("/api/classes", {
      cohortId: cohort.id,
      subjectId: (await createSubject(t, teacher.id, { name: "Banco de Dados" })).id,
    });
    const other = await createUser(t, { roles: ["TEACHER"], name: "Professor Beto" });
    const otherClient = await asUser(other);
    const theirs = await otherClient.post("/api/classes", {
      cohortId: cohort.id,
      subjectId: (await createSubject(t, other.id, { name: "Redes" })).id,
    });
    expect([mine.status, theirs.status]).toEqual([201, 201]);

    expect((await client.get("/api/classes")).body.items.map((item: { id: string }) => item.id)).toEqual([mine.body.id]);
    expect((await otherClient.get("/api/classes")).body.items.map((item: { id: string }) => item.id)).toEqual([theirs.body.id]);
    const foreign = await client.get(`/api/classes/${theirs.body.id}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("NOT_FOUND");
    expect((await search("ads 3na")).body.items[0].classes).toEqual([
      { subjectName: "Banco de Dados", teacherName: "Professora Ana" },
      { subjectName: "Redes", teacherName: "Professor Beto" },
    ]);
  });

  it("027/US3-6 busca sem resultado devolve a lista vazia", async () => {
    await createCohort(t, { name: "ADS 3NA" });
    const res = await search("inexistente");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it("027/FR-017 disciplina de outro professor ou inexistente e turma inexistente → 404; nada criado", async () => {
    const cohort = await createCohort(t);
    const foreign = await createSubject(t, (await createUser(t, { roles: ["TEACHER"] })).id);
    const subject = await createSubject(t, teacher.id);
    for (const body of [
      { cohortId: cohort.id, subjectId: foreign.id },
      { cohortId: cohort.id, subjectId: crypto.randomUUID() },
      { cohortId: crypto.randomUUID(), subjectId: subject.id },
    ]) {
      const res = await client.post("/api/classes", body);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect(await t.prisma.schoolClass.count()).toBe(0);
  });

  it("027/FR-017 disciplina desativada → 409 SUBJECT_INACTIVE; turma inativa ou arquivada → 409 COHORT_NOT_ACTIVE", async () => {
    const inactive = await createSubject(t, teacher.id, { status: "INACTIVE" });
    const subject = await createSubject(t, teacher.id);
    const refusedSubject = await client.post("/api/classes", { cohortId: (await createCohort(t)).id, subjectId: inactive.id });
    expect(refusedSubject.status).toBe(409);
    expect(refusedSubject.body.code).toBe("SUBJECT_INACTIVE");

    for (const status of ["INACTIVE", "ARCHIVED"] as const) {
      const res = await client.post("/api/classes", { cohortId: (await createCohort(t, { status })).id, subjectId: subject.id });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("COHORT_NOT_ACTIVE");
    }
    expect(await t.prisma.schoolClass.count()).toBe(0);
    expect(await events("class.created")).toEqual([]);
  });

  it.each([
    ["professor no corpo", { teacherId: "00000000-0000-4000-8000-000000000000" }],
    ["situação no corpo", { status: "ARCHIVED" }],
    ["dados da turma no corpo", { name: "Outra", code: "X-1", academicYear: 2026 }],
    ["só uma data", { startsOn: "2026-08-03" }],
    ["término antes do início", { startsOn: "2026-12-11", endsOn: "2026-08-03" }],
  ])("027/FR-017 %s → 400 e nada criado", async (_case, extra) => {
    const body = { cohortId: (await createCohort(t)).id, subjectId: (await createSubject(t, teacher.id)).id, ...extra };
    const res = await client.post("/api/classes", body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await t.prisma.schoolClass.count()).toBe(0);
  });

  it("027/FR-016 o gestor e o aluno não buscam turmas nem acrescentam disciplinas (403)", async () => {
    const cohort = await createCohort(t);
    for (const role of ["MANAGER", "STUDENT"] as const) {
      const other = await asUser(await createUser(t, { roles: [role] }));
      expect((await search("turma", other)).status).toBe(403);
      expect((await other.post("/api/classes", { cohortId: cohort.id, subjectId: crypto.randomUUID() })).status).toBe(403);
    }
  });

  it("027/FR-019 professor, turma e disciplina nunca mudam: o trigger recusa e o PATCH só aceita as datas", async () => {
    const cohort = await createCohort(t);
    const subject = await createSubject(t, teacher.id);
    const created = await client.post("/api/classes", { cohortId: cohort.id, subjectId: subject.id });
    const classId = created.body.id as string;
    const other = await createUser(t, { roles: ["TEACHER"] });

    for (const [column, value] of [
      ["teacher_id", other.id],
      ["cohort_id", (await createCohort(t)).id],
      ["subject_id", (await createSubject(t, teacher.id)).id],
    ] as const) {
      await expect(
        t.prisma.$executeRawUnsafe(`UPDATE classes SET ${column} = $1::uuid WHERE id = $2::uuid`, value, classId),
      ).rejects.toThrow(/immutable/);
    }
    for (const body of [{ cohortId: crypto.randomUUID() }, { subjectId: crypto.randomUUID() }, { teacherId: other.id }]) {
      const res = await client.patch(`/api/classes/${classId}`, { startsOn: null, endsOn: null, ...body });
      expect(res.status).toBe(400);
    }
    expect(await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } })).toMatchObject({
      teacherId: teacher.id,
      cohortId: cohort.id,
      subjectId: subject.id,
    });
  });
});
