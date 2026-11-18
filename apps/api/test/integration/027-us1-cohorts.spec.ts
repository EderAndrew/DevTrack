import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createClassInvitation,
  createCohort,
  createEnrollment,
  createSubject,
  createUser,
  loginAs,
  type TestUser,
  uniqueEmail,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const VALID = { name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026, period: "2026.2" };

/** The keys of a disciplina da turma in the MANAGER's page (027/FR-007): nothing pedagogical. */
const CLASS_SUMMARY_KEYS = ["effectiveStatus", "id", "subjectName", "teacherName"];

describe("027/US1 — gestor cria e administra as turmas (FR-001–FR-008)", () => {
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

  it("027/US1-1 a turma nasce ativa, sem disciplina e sem alunos, aparece na lista e é auditada", async () => {
    const res = await client.post("/api/cohorts", { ...VALID, name: `  ${VALID.name}  `, description: "Noturno" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: "ADS 3NA",
      code: "ADS-3NA",
      academicYear: 2026,
      period: "2026.2",
      description: "Noturno",
      status: "ACTIVE",
      activeEnrollmentCount: 0,
      classCount: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const row = await t.prisma.cohort.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ createdById: manager.id, searchKey: "ads 3na ads-3na" });
    expect(await events("cohort.created")).toMatchObject([
      {
        actorType: "USER",
        actorUserId: manager.id,
        targetType: "COHORT",
        targetId: row.id,
        metadata: { code: "ADS-3NA", academicYear: 2026 },
      },
    ]);
    expect(ids(await client.get("/api/cohorts"))).toEqual([row.id]);

    // The ADMIN keeps the MANAGER's capabilities (FR-001); period and description are optional.
    const admin = await asUser(await createUser(t, { roles: ["ADMIN"], name: "Admin" }));
    const minimal = await admin.post("/api/cohorts", { name: "BD 1", code: "BD-1", academicYear: 2026 });
    expect(minimal.status).toBe(201);
    expect(minimal.body).toMatchObject({ period: null, description: null });
  });

  it.each([
    ["sem nome", { ...VALID, name: " " }],
    ["código com espaço", { ...VALID, code: "ADS 3NA" }],
    ["código longo", { ...VALID, code: "X".repeat(31) }],
    ["ano fora do intervalo", { ...VALID, academicYear: 1899 }],
    ["período longo", { ...VALID, period: "p".repeat(61) }],
    ["descrição longa", { ...VALID, description: "d".repeat(1001) }],
    ["professor no corpo", { ...VALID, teacherId: crypto.randomUUID() }],
    ["situação no corpo", { ...VALID, status: "ARCHIVED" }],
  ])("027/FR-001 %s → 400 e nada criado", async (_case, body) => {
    const res = await client.post("/api/cohorts", body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await t.prisma.cohort.count()).toBe(0);
  });

  it("027/US1-2 027/FR-002 o mesmo código no mesmo ano, sem diferenciar maiúsculas → 409 COHORT_CODE_TAKEN; em outro ano → 201", async () => {
    expect((await client.post("/api/cohorts", VALID)).status).toBe(201);

    const same = await client.post("/api/cohorts", { ...VALID, code: "ads-3na" });
    expect(same.status).toBe(409);
    expect(same.body.code).toBe("COHORT_CODE_TAKEN");

    const nextYear = await client.post("/api/cohorts", { ...VALID, code: "ads-3na", academicYear: 2027 });
    expect(nextYear.status).toBe(201);

    // Editing into a taken code is refused the same way; keeping the own code with another case is not.
    const edited = await client.patch(`/api/cohorts/${nextYear.body.id}`, { academicYear: 2026 });
    expect(edited.status).toBe(409);
    expect(edited.body.code).toBe("COHORT_CODE_TAKEN");
    const recased = await client.patch(`/api/cohorts/${nextYear.body.id}`, { code: "ADS-3na" });
    expect(recased.status).toBe(200);
    expect(recased.body.code).toBe("ADS-3na");

    expect(await t.prisma.cohort.count()).toBe(2);
    expect(await events("cohort.created")).toHaveLength(2);
  });

  it("027/US1-3 027/FR-006 pesquisa sem acento e maiúsculas, filtros por ano e situação, mais recentes primeiro, ativas e inativas por padrão", async () => {
    const base = Date.now() - 100_000;
    const prog = await createCohort(t, { name: "Programação 1", code: "PRG-1", academicYear: 2025, createdAt: new Date(base) });
    const ads = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026, createdAt: new Date(base + 1000) });
    const ads2 = await createCohort(t, { name: "ADS 2NA", code: "ADS-2NA", academicYear: 2026, createdAt: new Date(base + 2000) });
    const inactive = await createCohort(t, { name: "Redes", code: "RED-1", academicYear: 2026, status: "INACTIVE", createdAt: new Date(base + 3000) });
    const archived = await createCohort(t, { name: "Antiga", code: "ANT-1", academicYear: 2024, status: "ARCHIVED" });

    // Year first (most recent), then creation (most recent), so ADS 2NA, Redes, ADS 3NA… are 2026 and come first.
    expect(ids(await client.get("/api/cohorts"))).toEqual([inactive.id, ads2.id, ads.id, prog.id]);
    expect(ids(await client.get(`/api/cohorts?q=${encodeURIComponent("PROGRAMAÇÃO")}`))).toEqual([prog.id]);
    expect(ids(await client.get("/api/cohorts?q=ads-3"))).toEqual([ads.id]);
    expect(ids(await client.get("/api/cohorts?q=%25"))).toEqual([]);
    expect(ids(await client.get("/api/cohorts?academicYear=2025"))).toEqual([prog.id]);
    expect(ids(await client.get("/api/cohorts?status=ARCHIVED"))).toEqual([archived.id]);
    expect(ids(await client.get("/api/cohorts?status=INACTIVE&academicYear=2026"))).toEqual([inactive.id]);

    // Keyset pages.
    const first = await client.get("/api/cohorts?limit=3");
    expect(ids(first)).toEqual([inactive.id, ads2.id, ads.id]);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await client.get(`/api/cohorts?limit=3&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    expect(ids(second)).toEqual([prog.id]);
    expect(second.body.nextCursor).toBeNull();

    for (const query of ["academicYear=abc", "status=DELETED", "cursor=nao-e-um-cursor", "limit=51", "teacherId=x"]) {
      expect((await client.get(`/api/cohorts?${query}`)).status, query).toBe(400);
    }
  });

  it("027/US1-4 027/FR-004 inativar e reativar valem na hora para a turma e para as disciplinas dela", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    const cohort = await createCohort(t);
    const schoolClass = await createClass(t, teacher.id, { cohortId: cohort.id });
    const teacherClient = await asUser(teacher);

    const inactive = await client.post(`/api/cohorts/${cohort.id}/status`, { to: "INACTIVE" });
    expect(inactive.status).toBe(200);
    expect(inactive.body.status).toBe("INACTIVE");
    expect((await teacherClient.get(`/api/classes/${schoolClass.id}`)).body.status).toBe("INACTIVE");
    // The same status again is a no-op.
    expect((await client.post(`/api/cohorts/${cohort.id}/status`, { to: "INACTIVE" })).status).toBe(200);

    const active = await client.post(`/api/cohorts/${cohort.id}/status`, { to: "ACTIVE" });
    expect(active.body.status).toBe("ACTIVE");
    expect((await teacherClient.get(`/api/classes/${schoolClass.id}`)).body.status).toBe("ACTIVE");

    expect(await events("cohort.status_changed")).toMatchObject([
      { actorUserId: manager.id, targetType: "COHORT", targetId: cohort.id, metadata: { from: "ACTIVE", to: "INACTIVE" } },
      { metadata: { from: "INACTIVE", to: "ACTIVE" } },
    ]);
    // The class's own status never moved (FR-023: the effective status is derived).
    expect((await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: schoolClass.id } })).status).toBe("ACTIVE");

    for (const body of [{ to: "DELETED" }, { to: "INACTIVE", reason: "x" }, { status: "INACTIVE" }]) {
      expect((await client.post(`/api/cohorts/${cohort.id}/status`, body)).status).toBe(400);
    }
  });

  it("027/US1-5 027/FR-005 arquivar cancela os convites pendentes (CLASS_ARCHIVED) na mesma operação, preserva matrículas e disciplinas, e a turma não é mais editada", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"], name: "Professor Turing" });
    const cohort = await createCohort(t, { status: "INACTIVE" });
    const schoolClass = await createClass(t, teacher.id, { cohortId: cohort.id });
    const { invitation: pending } = await createClassInvitation(t, schoolClass.id, uniqueEmail("pendente"));
    const { invitation: cancelled } = await createClassInvitation(t, schoolClass.id, uniqueEmail("cancelado"), { status: "CANCELLED" });
    const student = await createUser(t, { name: "Aluna Matriculada" });
    const enrollment = await createEnrollment(t, schoolClass.id, student.id);

    const res = await client.post(`/api/cohorts/${cohort.id}/status`, { to: "ARCHIVED" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ARCHIVED", activeEnrollmentCount: 1, classCount: 1 });

    expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: "CANCELLED",
      cancelReason: "CLASS_ARCHIVED",
      cancelledById: manager.id,
      cancelledAt: expect.any(Date),
    });
    expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: cancelled.id } })).toEqual(cancelled);
    expect((await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("ACTIVE");
    expect((await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: schoolClass.id } })).status).toBe("ACTIVE");
    expect(await events("cohort.status_changed")).toMatchObject([
      { metadata: { from: "INACTIVE", to: "ARCHIVED", cancelledInvitations: 1 } },
    ]);

    const edit = await client.patch(`/api/cohorts/${cohort.id}`, { name: "Outro nome" });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe("COHORT_ARCHIVED");
    for (const to of ["ACTIVE", "INACTIVE"]) {
      const back = await client.post(`/api/cohorts/${cohort.id}/status`, { to });
      expect(back.status).toBe(409);
      expect(back.body.code).toBe("INVALID_STATE_TRANSITION");
    }
    expect(await events("cohort.updated")).toEqual([]);
    expect(await events("cohort.status_changed")).toHaveLength(1);
  });

  it("027/US1-6 027/FR-007 a página da turma mostra as disciplinas e os professores, sem nada pedagógico", async () => {
    const ada = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    const turing = await createUser(t, { roles: ["TEACHER"], name: "Professor Turing" });
    const cohort = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA", period: "2026.2" });
    const bd = await createSubject(t, ada.id, { name: "Banco de Dados" });
    const redes = await createSubject(t, turing.id, { name: "Redes" });
    const first = await createClass(t, ada.id, { cohortId: cohort.id, subjectId: bd.id, startsOn: "2026-08-01", endsOn: "2026-12-10" });
    const second = await createClass(t, turing.id, { cohortId: cohort.id, subjectId: redes.id, status: "INACTIVE" });
    const student = await createUser(t, { name: "Aluna" });
    await createEnrollment(t, first.id, student.id);

    const res = await client.get(`/api/cohorts/${cohort.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: cohort.id, name: "ADS 3NA", code: "ADS-3NA", activeEnrollmentCount: 1, classCount: 2 });
    expect(res.body.classes).toEqual(
      expect.arrayContaining([
        { id: first.id, subjectName: "Banco de Dados", teacherName: "Professora Ada", effectiveStatus: "ACTIVE" },
        { id: second.id, subjectName: "Redes", teacherName: "Professor Turing", effectiveStatus: "INACTIVE" },
      ]),
    );
    expect(res.body.classes).toHaveLength(2);
    for (const item of res.body.classes) expect(Object.keys(item).sort()).toEqual(CLASS_SUMMARY_KEYS);
    expect(JSON.stringify(res.body)).not.toMatch(/startsOn|endsOn|plan|activit|grade|nota/i);

    // The effective status follows the cohort (FR-023).
    await t.prisma.cohort.update({ where: { id: cohort.id }, data: { status: "ARCHIVED" } });
    const archived = await client.get(`/api/cohorts/${cohort.id}`);
    expect(archived.body.classes.map((c: { effectiveStatus: string }) => c.effectiveStatus)).toEqual(["ARCHIVED", "ARCHIVED"]);
  });

  it("027/FR-008 nenhuma rota exclui uma turma, e o banco recusa excluir uma turma com disciplina ou matrícula", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const cohort = await createCohort(t);
    const schoolClass = await createClass(t, teacher.id, { cohortId: cohort.id });
    const res = await client.delete(`/api/cohorts/${cohort.id}`);
    expect([404, 405]).toContain(res.status);

    await expect(t.prisma.$executeRaw`DELETE FROM cohorts WHERE id = ${cohort.id}::uuid`).rejects.toThrow();
    await t.prisma.schoolClass.delete({ where: { id: schoolClass.id } }).catch(() => undefined);
    const withStudent = await createCohort(t);
    const student = await createUser(t);
    await t.prisma.enrollment.create({ data: { cohortId: withStudent.id, studentUserId: student.id, status: "ACTIVE", enrolledAt: new Date() } });
    await expect(t.prisma.$executeRaw`DELETE FROM cohorts WHERE id = ${withStudent.id}::uuid`).rejects.toThrow();
    expect(await t.prisma.cohort.count()).toBe(2);
  });

  it("027/FR-003 editar salva os campos enviados e audita só os nomes dos campos alterados", async () => {
    const cohort = await createCohort(t, { name: "Algoritmos", code: "ALG-1", period: "manhã", status: "INACTIVE" });
    const res = await client.patch(`/api/cohorts/${cohort.id}`, { name: "Algoritmos Avançados", period: null, description: "Nova", academicYear: 2026 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Algoritmos Avançados", code: "ALG-1", period: null, description: "Nova", status: "INACTIVE" });
    expect((await t.prisma.cohort.findUniqueOrThrow({ where: { id: cohort.id } })).searchKey).toBe("algoritmos avancados alg-1");
    const [event] = await events("cohort.updated");
    expect(event).toMatchObject({ actorUserId: manager.id, targetType: "COHORT", targetId: cohort.id });
    expect((event!.metadata as { fields: string[] }).fields.sort()).toEqual(["description", "name", "period"]);
    expect(JSON.stringify(event!.metadata)).not.toContain("Avançados");

    // Nothing changed → no event; unknown or empty bodies → 400.
    expect((await client.patch(`/api/cohorts/${cohort.id}`, { code: "ALG-1" })).status).toBe(200);
    expect(await events("cohort.updated")).toHaveLength(1);
    for (const body of [{}, { status: "ACTIVE" }, { createdById: manager.id }, { name: "" }]) {
      expect((await client.patch(`/api/cohorts/${cohort.id}`, body)).status).toBe(400);
    }
  });

  it("027/FR-004 só o gestor: professor e aluno → 403; turma inexistente → 404; id inválido → 400", async () => {
    const cohort = await createCohort(t);
    for (const role of ["TEACHER", "STUDENT"] as const) {
      const other = await asUser(await createUser(t, { roles: [role] }));
      for (const res of [
        await other.get("/api/cohorts"),
        await other.post("/api/cohorts", VALID),
        await other.get(`/api/cohorts/${cohort.id}`),
        await other.patch(`/api/cohorts/${cohort.id}`, { name: "Invadida" }),
        await other.post(`/api/cohorts/${cohort.id}/status`, { to: "ARCHIVED" }),
      ]) {
        expect(res.status, role).toBe(403);
      }
    }
    const unknown = crypto.randomUUID();
    for (const res of [
      await client.get(`/api/cohorts/${unknown}`),
      await client.patch(`/api/cohorts/${unknown}`, { name: "X" }),
      await client.post(`/api/cohorts/${unknown}/status`, { to: "INACTIVE" }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect((await client.get("/api/cohorts/nao-e-uuid")).status).toBe(400);
    expect(await t.prisma.cohort.findUniqueOrThrow({ where: { id: cohort.id } })).toEqual(cohort);
  });

  it("027/SC-006 20 criações simultâneas com o mesmo código e ano → uma turma, uma auditoria", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => client.post("/api/cohorts", { ...VALID, code: i % 2 ? "ads-3na" : "ADS-3NA" })),
    );
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status !== 201).map((res) => res.body.code)).toEqual(Array(19).fill("COHORT_CODE_TAKEN"));
    expect(await t.prisma.cohort.count()).toBe(1);
    expect(await events("cohort.created")).toHaveLength(1);
  });
});
