import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { routeKey } from "./authorization-matrix";
import {
  buildTeacherArea,
  callRoute,
  CURRICULUM_ROUTES,
  curriculumSnapshot,
  type TeacherArea,
  VALID_BODY,
} from "./004-curriculum-authorization-matrix";

const MISSING_ID = "00000000-0000-4000-8000-000000000001";
const ERROR_KEYS = ["code", "message", "statusCode"];

/**
 * 004/US8, 004/SC-002: every 004 route against the owner's area, as each subject of the
 * contract's matrix (contracts/permissions.md). A refusal carries only the standard error body
 * and changes nothing.
 */
describe("004/US8 004/SC-002 — área privada do professor (FR-044)", () => {
  let t: TestApp;
  let owner: TestUser;
  let area: TeacherArea;
  const users = new Map<string, TestUser>();

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    owner = await createUser(t, { roles: ["TEACHER"], name: "Professora Dona" });
    area = await buildTeacherArea(t, owner);
    users.set("STUDENT", await createUser(t, { roles: ["STUDENT"] }));
    users.set("MANAGER", await createUser(t, { roles: ["MANAGER"] }));
    users.set("ADMIN", await createUser(t, { roles: ["ADMIN"] }));
    users.set("outro TEACHER", await createUser(t, { roles: ["TEACHER"] }));
    users.set("TEACHER não verificado", await createUser(t, { roles: ["TEACHER"], verified: false }));
  });
  afterAll(() => t.close());

  const withId = CURRICULUM_ROUTES.filter((entry) => entry.path.includes(":id"));

  it("toda rota 004 da matriz tem corpo válido definido, e a matriz cobre as rotas das US1–US5", () => {
    expect(CURRICULUM_ROUTES.length).toBeGreaterThanOrEqual(20);
    for (const entry of CURRICULUM_ROUTES) expect(VALID_BODY, routeKey(entry)).toHaveProperty([routeKey(entry)]);
  });

  describe("004/US8-1 quem não é professor ativo é recusado, sem dado pedagógico", () => {
    it.each(CURRICULUM_ROUTES.map((entry) => [routeKey(entry), entry] as const))("%s sem sessão → 401", async (_key, entry) => {
      const res = await callRoute(t, entry, null, area);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    });

    it.each(CURRICULUM_ROUTES.map((entry) => [routeKey(entry), entry] as const))(
      "%s com e-mail não verificado → 403 EMAIL_NOT_VERIFIED",
      async (_key, entry) => {
        const res = await callRoute(t, entry, users.get("TEACHER não verificado")!, area);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "EMAIL_NOT_VERIFIED" });
      },
    );

    const withoutCapability = ["STUDENT", "MANAGER", "ADMIN"].flatMap((principal) =>
      CURRICULUM_ROUTES.map((entry) => [routeKey(entry), principal, entry] as const),
    );
    it.each(withoutCapability)("%s como %s (sem TEACHER) → 403, só o corpo de erro", async (_key, principal, entry) => {
      const before = await curriculumSnapshot(t);
      const res = await callRoute(t, entry, users.get(principal)!, area);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "FORBIDDEN" });
      expect(Object.keys(res.body).sort()).toEqual(ERROR_KEYS);
      expect(await curriculumSnapshot(t)).toEqual(before);
    });

    it.each([
      ["com o papel TEACHER suspenso", "SUSPENDED" as const],
      ["com o papel TEACHER desativado", "INACTIVE" as const],
      ["que perdeu o papel TEACHER", null],
    ])("professor %s → 403 em todas as rotas, com o conteúdo preservado no banco", async (_label, status) => {
      const teacher = await createUser(t, { roles: ["TEACHER", "STUDENT"] });
      const own = await buildTeacherArea(t, teacher);
      const teacherRole = await t.prisma.userRole.findFirstOrThrow({ where: { userId: teacher.id, role: { key: "TEACHER" } } });
      if (status) await t.prisma.userRole.update({ where: { id: teacherRole.id }, data: { status } });
      else await t.prisma.userRole.delete({ where: { id: teacherRole.id } });
      const before = await curriculumSnapshot(t);

      for (const entry of CURRICULUM_ROUTES) {
        const res = await callRoute(t, entry, teacher, own);
        expect({ route: routeKey(entry), status: res.status, code: res.body.code }).toEqual({
          route: routeKey(entry),
          status: 403,
          code: "FORBIDDEN",
        });
      }
      expect(await curriculumSnapshot(t)).toEqual(before);
      expect(await t.prisma.topic.count({ where: { id: own.topicId } })).toBe(1);
      expect(await t.prisma.syllabusDocument.count({ where: { id: own.documentId } })).toBe(1);
    });
  });

  it.each(withId.map((entry) => [routeKey(entry), entry] as const))(
    "004/US8-2 %s com os ids do dono, como outro professor → 404 idêntico ao de id inexistente, sem efeito",
    async (_key, entry) => {
      const other = users.get("outro TEACHER")!;
      const before = await curriculumSnapshot(t);

      const foreign = await callRoute(t, entry, other, area);
      const missing = await callRoute(t, entry, other, area, { id: MISSING_ID });

      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
      expect(foreign.body).toEqual(missing.body);
      expect(await curriculumSnapshot(t)).toEqual(before);
    },
  );

  it("004/US8-2 download do original (anexo e ?view=inline) de outro professor → o mesmo 404 de inexistente, sem bytes", async () => {
    const other = users.get("outro TEACHER")!;
    const file = CURRICULUM_ROUTES.find((entry) => routeKey(entry) === "GET /syllabus-documents/:id/file")!;
    for (const query of [undefined, "view=inline"]) {
      const foreign = await callRoute(t, file, other, area, { query });
      const missing = await callRoute(t, file, other, area, { id: MISSING_ID, query });
      expect(foreign.status).toBe(404);
      expect(foreign.headers["content-type"]).toMatch(/^application\/json/);
      expect(foreign.headers["content-disposition"]).toBeUndefined();
      expect(foreign.body).toEqual(missing.body);
    }
    // The owner gets the bytes, inline too (a PNG).
    const own = await callRoute(t, file, owner, area, { query: "view=inline" });
    expect(own.status).toBe(200);
    expect(own.headers["content-type"]).toBe("image/png");
  });

  it("004/US8-2 listagem de disciplinas do outro professor não mostra as do dono", async () => {
    const list = CURRICULUM_ROUTES.find((entry) => routeKey(entry) === "GET /subjects")!;
    const res = await callRoute(t, list, users.get("outro TEACHER")!, area);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("004/US8-6 ADMIN + TEACHER age como professor: 2xx no próprio conteúdo, 404 no alheio", async () => {
    const both = await createUser(t, { roles: ["ADMIN", "TEACHER"] });
    const own = await buildTeacherArea(t, both);

    for (const entry of CURRICULUM_ROUTES.filter((route) => route.method === "GET")) {
      const res = await callRoute(t, entry, both, own);
      expect({ route: routeKey(entry), status: res.status }).toEqual({ route: routeKey(entry), status: 200 });
    }
    for (const entry of CURRICULUM_ROUTES.filter((route) => route.method !== "GET")) {
      const res = await callRoute(t, entry, both, own);
      expect([401, 403, 404], `${routeKey(entry)} → ${res.status} ${res.body?.code}`).not.toContain(res.status);
    }

    const before = await curriculumSnapshot(t);
    for (const entry of withId) {
      const res = await callRoute(t, entry, both, area);
      expect({ route: routeKey(entry), status: res.status }).toEqual({ route: routeKey(entry), status: 404 });
    }
    expect(await curriculumSnapshot(t)).toEqual(before);
  });
});
