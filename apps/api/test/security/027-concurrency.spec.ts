import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCohort, createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 027 concurrency (research Q10, FR-018): one disciplina da turma per cohort and subject under simultaneous
 * requests, and "gestor arquiva × professor acrescenta" never leaves an ACTIVE class born after the archive.
 */
describe("027 concorrência da disciplina da turma", () => {
  let t: TestApp;
  let teacher: TestUser;
  let manager: TestUser;
  let teacherClient: ReturnType<typeof api>;
  let managerClient: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    manager = await createUser(t, { roles: ["MANAGER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    managerClient = api(t, { cookie: await loginAs(t, manager) });
  });

  it("027/FR-018 o mesmo professor acrescenta a mesma disciplina 10× ao mesmo tempo → uma disciplina da turma", async () => {
    const cohort = await createCohort(t);
    const subject = await createSubject(t, teacher.id);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => teacherClient.post("/api/classes", { cohortId: cohort.id, subjectId: subject.id })),
    );
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    for (const res of results.filter((item) => item.status !== 201)) {
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CLASS_SUBJECT_DUPLICATE");
    }
    expect(await t.prisma.schoolClass.count({ where: { cohortId: cohort.id } })).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "class.created" } })).toBe(1);
  });

  it("027/FR-017 gestor arquiva × professor acrescenta, 100 rodadas: recusa com COHORT_NOT_ACTIVE ou classe criada antes do arquivamento", async () => {
    const subject = await createSubject(t, teacher.id);
    for (let round = 0; round < 100; round += 1) {
      const cohort = await createCohort(t, { code: `CC-${round}` });
      const [added, archived] = await Promise.all([
        teacherClient.post("/api/classes", { cohortId: cohort.id, subjectId: subject.id }),
        managerClient.post(`/api/cohorts/${cohort.id}/status`, { to: "ARCHIVED" }),
      ]);
      expect(archived.status).toBe(200);
      const after = await t.prisma.cohort.findUniqueOrThrow({ where: { id: cohort.id } });
      if (added.status === 201) {
        const row = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: added.body.id } });
        expect(row.createdAt.getTime()).toBeLessThanOrEqual(after.statusChangedAt!.getTime());
        const [effective] = await t.prisma.$queryRaw<{ status: string }[]>`
          SELECT class_effective_status(${row.id}::uuid)::text AS status`;
        expect(effective!.status).toBe("ARCHIVED");
      } else {
        expect(added.status).toBe(409);
        expect(added.body.code).toBe("COHORT_NOT_ACTIVE");
        expect(await t.prisma.schoolClass.count({ where: { cohortId: cohort.id } })).toBe(0);
      }
    }
  });

  it("027/US3-2 busca e criação em uma chamada cada", async () => {
    const cohort = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA" });
    const subject = await createSubject(t, teacher.id);
    const found = await teacherClient.get("/api/cohort-directory?q=ads");
    expect(found.body.items.map((item: { id: string }) => item.id)).toEqual([cohort.id]);
    const created = await teacherClient.post("/api/classes", { cohortId: found.body.items[0].id, subjectId: subject.id });
    expect(created.status).toBe(201);
  });
});
