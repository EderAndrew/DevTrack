import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createClass, createClassInvitation, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { CURRICULUM, MATRIX, type MatrixEntry, routeKey } from "./authorization-matrix";

/**
 * The 003 rows of the matrix: every route of a teacher's classes and what hangs off them. The
 * 004 routes under a class (calendar, plan) need a plannable class and belong to the 004 matrix;
 * the 012 activities, to `012-isolation.spec.ts`.
 */
const CLASS_ROUTES = MATRIX.filter(
  (entry) =>
    entry.path.startsWith("/classes") &&
    !(CURRICULUM as readonly string[]).includes(entry.access) &&
    !entry.path.startsWith("/classes/:classId/activities"),
);

/**
 * A body that passes validation for each route, so the context check (404) is what answers.
 * A new 003 route must be added here, or the test fails.
 */
const VALID_BODY: Record<string, object> = {
  "GET /classes": {},
  "POST /classes": { name: "Turma Válida", code: "VAL-1", academicYear: 2026 },
  "GET /classes/:id": {},
  "PATCH /classes/:id": { name: "Outro nome" },
  "POST /classes/:id/status": { status: "INACTIVE" },
  "POST /classes/:id/invitations": { email: "aluno@example.test" },
  "GET /classes/:id/invitations": {},
  "POST /classes/:id/invitations/:invitationId/resend": {},
  "POST /classes/:id/invitations/:invitationId/cancel": {},
  "GET /classes/:id/enrollments": {},
  "POST /classes/:id/enrollments/:enrollmentId/remove": {},
};

/**
 * An unknown field in the body or the query of each route; `null` for a route without input
 * (nothing to validate: the id is checked by the path pipe).
 */
const WITH_UNKNOWN_FIELD: Record<string, { body?: object; query?: string } | null> = {
  "GET /classes": { query: "teacherId=00000000-0000-4000-8000-000000000000" },
  "POST /classes": { body: { ...VALID_BODY["POST /classes"], teacherId: "00000000-0000-4000-8000-000000000000" } },
  "GET /classes/:id": null,
  "PATCH /classes/:id": { body: { name: "Outro nome", status: "ARCHIVED" } },
  "POST /classes/:id/status": { body: { status: "INACTIVE", teacherId: "00000000-0000-4000-8000-000000000000" } },
  "POST /classes/:id/invitations": { body: { email: "aluno@example.test", role: "TEACHER" } },
  "GET /classes/:id/invitations": { query: "email=aluno@example.test" },
  "POST /classes/:id/invitations/:invitationId/resend": { body: { email: "outro@example.test" } },
  "POST /classes/:id/invitations/:invitationId/cancel": { body: { reason: "ALREADY_ENROLLED" } },
  "GET /classes/:id/enrollments": { query: "email=aluno@example.test" },
  "POST /classes/:id/enrollments/:enrollmentId/remove": { body: { studentUserId: "00000000-0000-4000-8000-000000000000" } },
};

const MISSING_ID = "00000000-0000-4000-8000-000000000001";

describe("003/US8 003/SC-003 — autorização por turma (FR-050–FR-056)", () => {
  let t: TestApp;
  let owner: TestUser;
  let ownerClass: SchoolClass;
  let ownerInvitationId: string;
  let ownerEnrollmentId: string;
  const users = new Map<string, TestUser>();

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    owner = await createUser(t, { roles: ["TEACHER"], name: "Professora Dona" });
    ownerClass = await createClass(t, owner.id, { code: "DONA-1" });
    ownerInvitationId = (await createClassInvitation(t, ownerClass.id, "convidado@example.test")).invitation.id;
    const enrolled = await createUser(t, { name: "Aluno Matriculado" });
    ownerEnrollmentId = (await createEnrollment(t, ownerClass.id, enrolled.id)).id;
    users.set("STUDENT", await createUser(t, { roles: ["STUDENT"] }));
    users.set("MANAGER", await createUser(t, { roles: ["MANAGER"] }));
    users.set("ADMIN", await createUser(t, { roles: ["ADMIN"] }));
    users.set("outro TEACHER", await createUser(t, { roles: ["TEACHER"] }));
    users.set("TEACHER suspenso", await createUser(t, { roles: [{ key: "TEACHER", status: "SUSPENDED" }] }));
    users.set("TEACHER desativado", await createUser(t, { roles: [{ key: "TEACHER", status: "INACTIVE" }] }));
  });
  afterAll(() => t.close());

  const pathFor = (entry: MatrixEntry, classId: string) =>
    `/api${entry.path
      .replace(":invitationId", ownerInvitationId)
      .replace(":enrollmentId", ownerEnrollmentId)
      .replace(":id", classId)}`;

  async function call(entry: MatrixEntry, user: TestUser | null, options: { classId?: string; body?: object; query?: string } = {}) {
    const client = api(t, { cookie: user ? await loginAs(t, user) : undefined });
    const url = pathFor(entry, options.classId ?? ownerClass.id) + (options.query ? `?${options.query}` : "");
    const body = options.body ?? VALID_BODY[routeKey(entry)] ?? {};
    if (entry.method === "GET") return client.get(url);
    if (entry.method === "PATCH") return client.patch(url, body);
    if (entry.method === "DELETE") return client.delete(url);
    return client.post(url, body);
  }

  const snapshot = async () => ({
    classes: await t.prisma.schoolClass.findMany({ orderBy: { id: "asc" } }),
    invitations: await t.prisma.classInvitation.count(),
    enrollments: await t.prisma.enrollment.count(),
  });

  it("toda rota da 003 tem corpo válido e campo desconhecido definidos neste teste", () => {
    expect(CLASS_ROUTES.length).toBeGreaterThan(0);
    for (const entry of CLASS_ROUTES) {
      expect(VALID_BODY, routeKey(entry)).toHaveProperty([routeKey(entry)]);
      expect(WITH_UNKNOWN_FIELD, routeKey(entry)).toHaveProperty([routeKey(entry)]);
    }
  });

  it.each(CLASS_ROUTES.map((entry) => [routeKey(entry), entry] as const))("003/US8-1 %s sem sessão → 401", async (_key, entry) => {
    const res = await call(entry, null);
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 401, code: "UNAUTHENTICATED" });
  });

  const withoutCapability = ["STUDENT", "MANAGER", "ADMIN"].flatMap((principal) =>
    CLASS_ROUTES.map((entry) => [routeKey(entry), principal, entry] as const),
  );
  it.each(withoutCapability)("003/US8-2 %s como %s (sem TEACHER) → 403", async (_key, principal, entry) => {
    const res = await call(entry, users.get(principal)!);
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "FORBIDDEN" });
  });

  const withId = CLASS_ROUTES.filter((entry) => entry.path.includes(":id"));
  it.each(withId.map((entry) => [routeKey(entry), entry] as const))(
    "003/US8-3 %s com turma de outro professor → 404 idêntico ao de id inexistente, sem efeito",
    async (_key, entry) => {
      const before = await snapshot();
      const other = users.get("outro TEACHER")!;
      const foreign = await call(entry, other);
      const missing = await call(entry, other, { classId: MISSING_ID });

      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
      expect(foreign.body).toEqual(missing.body);
      expect(await snapshot()).toEqual(before);
    },
  );

  const suspended = ["TEACHER suspenso", "TEACHER desativado"].flatMap((principal) =>
    CLASS_ROUTES.map((entry) => [routeKey(entry), principal, entry] as const),
  );
  it.each(suspended)("003/US8-4 %s como %s → 403; turmas intactas", async (_key, principal, entry) => {
    const user = users.get(principal)!;
    const own = await createClass(t, user.id);
    const before = await snapshot();
    const res = await call(entry, user, { classId: own.id });
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "FORBIDDEN" });
    expect(await snapshot()).toEqual(before);
  });

  const withInput = CLASS_ROUTES.filter((entry) => WITH_UNKNOWN_FIELD[routeKey(entry)] !== null);
  it.each(withInput.map((entry) => [routeKey(entry), entry] as const))(
    "003/US8-6 %s com campo desconhecido → 400, sem efeito",
    async (_key, entry) => {
      const before = await snapshot();
      const res = await call(entry, owner, WITH_UNKNOWN_FIELD[routeKey(entry)]!);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
      expect(await snapshot()).toEqual(before);
    },
  );
});
