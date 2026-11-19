import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createClass,
  createClassInvitation,
  createCohort,
  createEnrollment,
  createSubject,
  createUser,
  loginAs,
  type TestUser,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { MATRIX, type MatrixEntry, routeKey } from "./authorization-matrix";

/**
 * The 003 rows of the matrix after 027 (amendment 2026-11-17): the turma, its invitations and its enrollments belong
 * to the MANAGER (and the ADMIN) under `/cohorts`; the teacher keeps their disciplina da turma under `/classes`
 * (the class itself and its read-only roster). The 004 routes under a class (calendar, plan) are in the 004 matrix;
 * the 012 activities in `012-isolation.spec.ts`; the ranking in `013-us5-teacher-ranking.spec.ts`; the other teacher
 * in the same turma in `027-isolation.spec.ts`.
 */
const COHORT_ROUTES = MATRIX.filter((entry) => entry.path.startsWith("/cohorts"));
const CLASS_ROUTE_KEYS = [
  "GET /classes",
  "POST /classes",
  "GET /classes/:id",
  "PATCH /classes/:id",
  "POST /classes/:id/status",
  "GET /classes/:id/enrollments",
];
const CLASS_ROUTES = MATRIX.filter((entry) => CLASS_ROUTE_KEYS.includes(routeKey(entry)));
const ROUTES = [...COHORT_ROUTES, ...CLASS_ROUTES];

const MISSING_ID = "00000000-0000-4000-8000-000000000001";

interface Ids {
  cohortId: string;
  classId: string;
  invitationId: string;
  enrollmentId: string;
  /** For `POST /classes`. */
  subjectId: string;
  otherCohortId: string;
}

/**
 * A body that passes validation for each route, so the context check (404) is what answers.
 * A new route of the turma or of the disciplina da turma must be added here, or the test fails.
 */
const VALID_BODY: Record<string, (ids: Ids) => object> = {
  "GET /cohorts": () => ({}),
  "POST /cohorts": () => ({ name: "Turma Válida", code: "VAL-1", academicYear: 2026 }),
  "GET /cohorts/:id": () => ({}),
  "PATCH /cohorts/:id": () => ({ name: "Outro nome" }),
  "POST /cohorts/:id/status": () => ({ to: "INACTIVE" }),
  "GET /cohorts/:id/invitations": () => ({}),
  "POST /cohorts/:id/invitations": () => ({ email: "aluno@example.test" }),
  "POST /cohorts/:id/invitations/:invitationId/resend": () => ({}),
  "POST /cohorts/:id/invitations/:invitationId/cancel": () => ({}),
  "GET /cohorts/:id/enrollments": () => ({}),
  "POST /cohorts/:id/student-lookup": () => ({ email: "aluno@example.test" }),
  "POST /cohorts/:id/enrollments": () => ({ email: "aluno@example.test" }),
  "POST /cohorts/:id/enrollments/:enrollmentId/remove": () => ({}),
  "GET /classes": () => ({}),
  "POST /classes": (ids) => ({ cohortId: ids.otherCohortId, subjectId: ids.subjectId }),
  "GET /classes/:id": () => ({}),
  "PATCH /classes/:id": () => ({ startsOn: null, endsOn: null }),
  "POST /classes/:id/status": () => ({ status: "INACTIVE" }),
  "GET /classes/:id/enrollments": () => ({}),
};

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

/**
 * An unknown field in the body or the query of each route; `null` for a route without input
 * (nothing to validate: the id is checked by the path pipe).
 */
const WITH_UNKNOWN_FIELD: Record<string, { body?: object; query?: string } | null> = {
  "GET /cohorts": { query: `createdById=${UNKNOWN_ID}` },
  "POST /cohorts": { body: { name: "Turma Válida", code: "VAL-1", academicYear: 2026, createdById: UNKNOWN_ID } },
  "GET /cohorts/:id": null,
  "PATCH /cohorts/:id": { body: { name: "Outro nome", status: "ARCHIVED" } },
  "POST /cohorts/:id/status": { body: { to: "INACTIVE", managerId: UNKNOWN_ID } },
  "GET /cohorts/:id/invitations": { query: "email=aluno@example.test" },
  "POST /cohorts/:id/invitations": { body: { email: "aluno@example.test", role: "TEACHER" } },
  "POST /cohorts/:id/invitations/:invitationId/resend": { body: { email: "outro@example.test" } },
  "POST /cohorts/:id/invitations/:invitationId/cancel": { body: { reason: "ALREADY_ENROLLED" } },
  "GET /cohorts/:id/enrollments": { query: "email=aluno@example.test" },
  "POST /cohorts/:id/student-lookup": { body: { email: "aluno@example.test", studentUserId: UNKNOWN_ID } },
  "POST /cohorts/:id/enrollments": { body: { email: "aluno@example.test", studentUserId: UNKNOWN_ID } },
  "POST /cohorts/:id/enrollments/:enrollmentId/remove": { body: { studentUserId: UNKNOWN_ID } },
  "GET /classes": { query: `teacherId=${UNKNOWN_ID}` },
  "POST /classes": { body: { cohortId: UNKNOWN_ID, subjectId: UNKNOWN_ID, teacherId: UNKNOWN_ID } },
  "GET /classes/:id": null,
  "PATCH /classes/:id": { body: { startsOn: null, endsOn: null, name: "Outro nome" } },
  "POST /classes/:id/status": { body: { status: "INACTIVE", teacherId: UNKNOWN_ID } },
  "GET /classes/:id/enrollments": { query: "email=aluno@example.test" },
};

describe("003/US8 003/SC-003 — autorização por turma (FR-050–FR-056; dono desde a 027: o gestor)", () => {
  let t: TestApp;
  let manager: TestUser;
  let teacher: TestUser;
  let own: Ids;
  /** An invitation and an enrollment of another turma, for the sub-resources of `own.cohortId`. */
  let foreignInvitationId: string;
  let foreignEnrollmentId: string;
  const users = new Map<string, TestUser>();

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    manager = await createUser(t, { roles: ["MANAGER"], name: "Gestora Dona" });
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Dona" });
    const subject = await createSubject(t, teacher.id);
    const cohort = await createCohort(t, { code: "DONA-1", createdById: manager.id });
    const schoolClass = await createClass(t, teacher.id, { cohortId: cohort.id, subjectId: subject.id });
    const otherCohort = await createCohort(t, { code: "OUTRA-1", createdById: manager.id });
    const otherClass = await createClass(t, teacher.id, { cohortId: otherCohort.id });
    own = {
      cohortId: cohort.id,
      classId: schoolClass.id,
      invitationId: (await createClassInvitation(t, schoolClass.id, "convidado@example.test", { invitedById: manager.id })).invitation.id,
      enrollmentId: (await createEnrollment(t, schoolClass.id, (await createUser(t, { name: "Aluno Matriculado" })).id)).id,
      subjectId: (await createSubject(t, teacher.id, { name: "Outra disciplina" })).id,
      otherCohortId: otherCohort.id,
    };
    foreignInvitationId = (await createClassInvitation(t, otherClass.id, "outro@example.test", { invitedById: manager.id })).invitation.id;
    foreignEnrollmentId = (await createEnrollment(t, otherClass.id, (await createUser(t, { name: "Aluno de Outra" })).id)).id;
    users.set("STUDENT", await createUser(t, { roles: ["STUDENT"] }));
    users.set("TEACHER", await createUser(t, { roles: ["TEACHER"] }));
    users.set("MANAGER", await createUser(t, { roles: ["MANAGER"] }));
    users.set("ADMIN", await createUser(t, { roles: ["ADMIN"] }));
    users.set("outro TEACHER", await createUser(t, { roles: ["TEACHER"] }));
    users.set("TEACHER suspenso", await createUser(t, { roles: [{ key: "TEACHER", status: "SUSPENDED" }] }));
    users.set("TEACHER desativado", await createUser(t, { roles: [{ key: "TEACHER", status: "INACTIVE" }] }));
    users.set("MANAGER desativado", await createUser(t, { roles: [{ key: "MANAGER", status: "INACTIVE" }] }));
  });
  afterAll(() => t.close());

  const isCohortRoute = (entry: MatrixEntry) => entry.path.startsWith("/cohorts");
  /** The owner of each route: the MANAGER for the turma, the teacher for their disciplina da turma. */
  const ownerOf = (entry: MatrixEntry) => (isCohortRoute(entry) ? manager : teacher);

  async function call(entry: MatrixEntry, user: TestUser | null, options: { ids?: Partial<Ids>; body?: object; query?: string } = {}) {
    const ids = { ...own, ...options.ids };
    const client = api(t, { cookie: user ? await loginAs(t, user) : undefined });
    const url =
      `/api${entry.path
        .replace(":invitationId", ids.invitationId)
        .replace(":enrollmentId", ids.enrollmentId)
        .replace(":id", isCohortRoute(entry) ? ids.cohortId : ids.classId)}` + (options.query ? `?${options.query}` : "");
    const body = options.body ?? VALID_BODY[routeKey(entry)]?.(ids) ?? {};
    if (entry.method === "GET") return client.get(url);
    if (entry.method === "PATCH") return client.patch(url, body);
    if (entry.method === "DELETE") return client.delete(url);
    return client.post(url, body);
  }

  const snapshot = async () => ({
    cohorts: await t.prisma.cohort.findMany({ orderBy: { id: "asc" } }),
    classes: await t.prisma.schoolClass.findMany({ orderBy: { id: "asc" } }),
    invitations: await t.prisma.classInvitation.findMany({ orderBy: { id: "asc" } }),
    enrollments: await t.prisma.enrollment.findMany({ orderBy: { id: "asc" } }),
  });

  it("toda rota da turma e da disciplina da turma tem corpo válido e campo desconhecido definidos neste teste", () => {
    expect(COHORT_ROUTES.length).toBe(13);
    expect(CLASS_ROUTES.length).toBe(CLASS_ROUTE_KEYS.length);
    for (const entry of ROUTES) {
      expect(VALID_BODY, routeKey(entry)).toHaveProperty([routeKey(entry)]);
      expect(WITH_UNKNOWN_FIELD, routeKey(entry)).toHaveProperty([routeKey(entry)]);
    }
  });

  it.each(ROUTES.map((entry) => [routeKey(entry), entry] as const))("003/US8-1 %s sem sessão → 401", async (_key, entry) => {
    const res = await call(entry, null);
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 401, code: "UNAUTHENTICATED" });
  });

  const withoutCapability = [
    ...COHORT_ROUTES.flatMap((entry) => ["STUDENT", "TEACHER"].map((principal) => [routeKey(entry), principal, entry] as const)),
    ...CLASS_ROUTES.flatMap((entry) => ["STUDENT", "MANAGER", "ADMIN"].map((principal) => [routeKey(entry), principal, entry] as const)),
  ];
  it.each(withoutCapability)("003/US8-2 %s como %s (sem a capacidade) → 403, sem efeito", async (_key, principal, entry) => {
    const before = await snapshot();
    const res = await call(entry, users.get(principal)!);
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "FORBIDDEN" });
    expect(await snapshot()).toEqual(before);
  });

  const teacherWithId = CLASS_ROUTES.filter((entry) => entry.path.includes(":id"));
  it.each(teacherWithId.map((entry) => [routeKey(entry), entry] as const))(
    "003/US8-3 %s com disciplina da turma de outro professor → 404 idêntico ao de id inexistente, sem efeito",
    async (_key, entry) => {
      const before = await snapshot();
      const other = users.get("outro TEACHER")!;
      const foreign = await call(entry, other);
      const missing = await call(entry, other, { ids: { classId: MISSING_ID } });

      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
      expect(foreign.body).toEqual(missing.body);
      expect(await snapshot()).toEqual(before);
    },
  );

  const cohortWithId = COHORT_ROUTES.filter((entry) => entry.path.includes(":id"));
  it.each(cohortWithId.map((entry) => [routeKey(entry), entry] as const))(
    "003/US8-3 %s com turma inexistente → 404, sem efeito",
    async (_key, entry) => {
      const before = await snapshot();
      const res = await call(entry, manager, { ids: { cohortId: MISSING_ID } });
      expect(res.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
      expect(await snapshot()).toEqual(before);
    },
  );

  const subResource = COHORT_ROUTES.filter((entry) => /:invitationId|:enrollmentId/.test(entry.path));
  it.each(subResource.map((entry) => [routeKey(entry), entry] as const))(
    "003/US8-3 %s com convite ou matrícula de outra turma → 404 idêntico ao de id inexistente, sem efeito",
    async (_key, entry) => {
      const before = await snapshot();
      const foreign = await call(entry, manager, { ids: { invitationId: foreignInvitationId, enrollmentId: foreignEnrollmentId } });
      const missing = await call(entry, manager, { ids: { invitationId: MISSING_ID, enrollmentId: MISSING_ID } });
      expect(foreign.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
      expect(foreign.body).toEqual(missing.body);
      expect(await snapshot()).toEqual(before);
    },
  );

  const suspended = [
    ...CLASS_ROUTES.flatMap((entry) => ["TEACHER suspenso", "TEACHER desativado"].map((principal) => [routeKey(entry), principal, entry] as const)),
    ...COHORT_ROUTES.map((entry) => [routeKey(entry), "MANAGER desativado", entry] as const),
  ];
  it.each(suspended)("003/US8-4 %s como %s → 403; turmas intactas", async (_key, principal, entry) => {
    const user = users.get(principal)!;
    const ids: Partial<Ids> = isCohortRoute(entry) ? {} : { classId: (await createClass(t, user.id)).id };
    const before = await snapshot();
    const res = await call(entry, user, { ids });
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "FORBIDDEN" });
    expect(await snapshot()).toEqual(before);
  });

  const withInput = ROUTES.filter((entry) => WITH_UNKNOWN_FIELD[routeKey(entry)] !== null);
  it.each(withInput.map((entry) => [routeKey(entry), entry] as const))(
    "003/US8-6 %s com campo desconhecido → 400, sem efeito",
    async (_key, entry) => {
      const before = await snapshot();
      const res = await call(entry, ownerOf(entry), WITH_UNKNOWN_FIELD[routeKey(entry)]!);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
      expect(await snapshot()).toEqual(before);
    },
  );
});
