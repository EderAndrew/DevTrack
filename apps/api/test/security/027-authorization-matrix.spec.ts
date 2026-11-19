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

type Principal = "anônimo" | "ADMIN" | "MANAGER" | "TEACHER" | "STUDENT";
const PRINCIPALS: Principal[] = ["anônimo", "ADMIN", "MANAGER", "TEACHER", "STUDENT"];

/** The teacher's routes of the disciplina da turma that 027 creates or changes. */
const CLASS_ROUTES = new Set([
  "GET /classes",
  "POST /classes",
  "GET /classes/:id",
  "PATCH /classes/:id",
  "POST /classes/:id/status",
  "GET /classes/:id/enrollments",
]);

/** Every route that 027 creates or changes (contracts/http-api.md). */
const ROUTES_027 = MATRIX.filter(
  (entry) => entry.path.startsWith("/cohort") || CLASS_ROUTES.has(routeKey(entry)) || routeKey(entry) === "GET /me/classes",
);

/** contracts/permissions.md: who may call each route; everyone else gets `403` (anonymous `401`). */
function allowedFor(entry: MatrixEntry): readonly Principal[] {
  if (entry.path.startsWith("/cohorts")) return ["ADMIN", "MANAGER"];
  if (routeKey(entry) === "GET /me/classes") return ["STUDENT"];
  return ["TEACHER"];
}

/** A fresh scene per call, so a write that succeeds never changes another case. */
interface Scene {
  cohortId: string;
  invitationId: string;
  enrollmentId: string;
  classId: string;
  /** An ACTIVE turma without the teacher's subject, for `POST /classes`. */
  otherCohortId: string;
  subjectId: string;
  /** An existing student account outside the turma, for the lookup and the direct enrollment. */
  outsiderEmail: string;
}

/**
 * 027/US7 (T050; contracts/permissions.md): each new or changed route × ADMIN, MANAGER, TEACHER, STUDENT and
 * anonymous, on real resources. Allowed → a success status; not allowed → `403 FORBIDDEN` (anonymous `401`) with
 * nothing changed. The teacher's context (another teacher's disciplina → 404) is in 027-isolation.spec.ts.
 */
describe("027/US7 027/SC-003 matriz de autorização das rotas da 027", () => {
  let t: TestApp;
  const users = new Map<Principal, TestUser>();
  let sequence = 0;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    for (const role of ["ADMIN", "MANAGER", "TEACHER", "STUDENT"] as const) {
      users.set(role, await createUser(t, { roles: [role] }));
    }
  });
  afterAll(() => t.close());

  async function scene(): Promise<Scene> {
    sequence += 1;
    const teacher = users.get("TEACHER")!;
    const student = users.get("STUDENT")!;
    const subject = await createSubject(t, teacher.id, { name: `Disciplina ${sequence}` });
    const other = await createSubject(t, teacher.id, { name: `Outra ${sequence}` });
    const cohort = await createCohort(t, { code: `MTZ-${sequence}`, name: `Matriz ${sequence}` });
    // A calendar already ended, so closing the disciplina is allowed (FR-022).
    const schoolClass = await createClass(t, teacher.id, {
      cohortId: cohort.id,
      subjectId: subject.id,
      startsOn: "2026-02-02",
      endsOn: "2026-06-30",
    });
    const otherCohort = await createCohort(t, { code: `MTZ-OUTRA-${sequence}`, name: `Matriz outra ${sequence}` });
    const enrollment = await createEnrollment(t, schoolClass.id, (await createUser(t, { roles: ["STUDENT"] })).id);
    // The STUDENT principal is enrolled too, so "Minhas turmas" has something to show.
    await createEnrollment(t, schoolClass.id, student.id);
    const invitation = await createClassInvitation(t, schoolClass.id, `convite-${sequence}@example.test`, {
      invitedById: users.get("MANAGER")!.id,
      lastSentAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const outsider = await createUser(t, { roles: ["STUDENT"] });
    return {
      cohortId: cohort.id,
      invitationId: invitation.invitation.id,
      enrollmentId: enrollment.id,
      classId: schoolClass.id,
      otherCohortId: otherCohort.id,
      subjectId: other.id,
      outsiderEmail: outsider.email,
    };
  }

  const BODY: Record<string, (s: Scene) => object> = {
    "POST /cohorts": () => ({ name: `Nova ${sequence}`, code: `NOVA-${sequence}`, academicYear: 2026 }),
    "PATCH /cohorts/:id": () => ({ name: "Outro nome" }),
    "POST /cohorts/:id/status": () => ({ to: "INACTIVE" }),
    "POST /cohorts/:id/invitations": () => ({ email: `novo-${sequence}@example.test` }),
    "POST /cohorts/:id/student-lookup": (s) => ({ email: s.outsiderEmail }),
    "POST /cohorts/:id/enrollments": (s) => ({ email: s.outsiderEmail }),
    "POST /classes": (s) => ({ cohortId: s.otherCohortId, subjectId: s.subjectId }),
    "PATCH /classes/:id": () => ({ startsOn: "2026-02-02", endsOn: "2026-07-03" }),
    "POST /classes/:id/status": () => ({ status: "INACTIVE" }),
  };
  const QUERY: Record<string, string> = { "GET /cohort-directory": "q=Matriz" };

  async function call(entry: MatrixEntry, principal: Principal, s: Scene) {
    const user = users.get(principal);
    const client = api(t, { cookie: user ? await loginAs(t, user) : undefined });
    const key = routeKey(entry);
    const id = entry.path.startsWith("/cohorts") ? s.cohortId : s.classId;
    const url = `/api${entry.path
      .replace(":invitationId", s.invitationId)
      .replace(":enrollmentId", s.enrollmentId)
      .replace(":id", id)}${QUERY[key] ? `?${QUERY[key]}` : ""}`;
    const body = BODY[key]?.(s) ?? {};
    if (entry.method === "GET") return client.get(url);
    if (entry.method === "PATCH") return client.patch(url, body);
    return client.post(url, body);
  }

  const snapshot = async () => ({
    cohorts: await t.prisma.cohort.findMany({ orderBy: { id: "asc" } }),
    classes: await t.prisma.schoolClass.findMany({ orderBy: { id: "asc" } }),
    enrollments: await t.prisma.enrollment.findMany({ orderBy: { id: "asc" } }),
    invitations: await t.prisma.classInvitation.findMany({ orderBy: { id: "asc" } }),
  });

  it("as rotas da 027 estão no MATRIX (turma, convites, alunos, busca, disciplina da turma, Minhas turmas)", () => {
    const keys = ROUTES_027.map(routeKey);
    expect(keys).toEqual(expect.arrayContaining([...CLASS_ROUTES, "GET /me/classes", "GET /cohort-directory", "POST /cohorts/:id/enrollments"]));
    expect(keys.length).toBe(21);
  });

  const cases = ROUTES_027.flatMap((entry) => PRINCIPALS.map((principal) => [routeKey(entry), principal, entry] as const));

  it.each(cases)("027/SC-003 %s — %s", async (_key, principal, entry) => {
    const s = await scene();
    const before = await snapshot();
    const res = await call(entry, principal, s);
    if (principal === "anônimo") {
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    } else if (allowedFor(entry).includes(principal)) {
      expect(res.status, `${routeKey(entry)} como ${principal}: ${res.status} ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(200);
      expect(res.status, `${routeKey(entry)} como ${principal}: ${res.status} ${JSON.stringify(res.body)}`).toBeLessThan(300);
      return;
    } else {
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "FORBIDDEN" });
    }
    expect(await snapshot()).toEqual(before);
  });
});
