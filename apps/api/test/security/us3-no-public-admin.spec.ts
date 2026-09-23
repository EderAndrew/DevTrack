import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClass, createClassInvitation, createUser, uniqueEmail } from "../helpers/factories";
import { type RegisteredRoute, registeredRoutes } from "../helpers/routes";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** FR-030 / US3-8: no public operation creates or promotes an ADMIN. */
describe("US3-8 — nenhuma rota pública produz ADMIN", () => {
  let routes: RegisteredRoute[];
  let t: TestApp;

  beforeAll(async () => {
    routes = await registeredRoutes();
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  const adminAssignments = () => t.prisma.userRole.count({ where: { role: { key: "ADMIN" } } });

  it("não existe rota de bootstrap; as únicas rotas com 'admin' são as de ativação", () => {
    expect(routes.filter((r) => /bootstrap/i.test(r.route))).toEqual([]);
    expect(routes.filter((r) => /admin/i.test(r.route)).map((r) => r.route).sort()).toEqual([
      "POST /admin-activation",
      "POST /admin-activation/preview",
    ]);
  });

  it("as rotas de ativação são públicas e nenhuma outra rota pública trata de ADMIN", () => {
    const publicAdmin = routes.filter((r) => r.isPublic && /admin/i.test(r.route)).map((r) => r.route);
    expect(publicAdmin.sort()).toEqual(["POST /admin-activation", "POST /admin-activation/preview"]);
  });

  it.each([
    ["role", { role: "ADMIN" }],
    ["roles", { roles: ["ADMIN"] }],
    ["roleKey", { roleKey: "ADMIN" }],
    ["isAdmin", { isAdmin: true }],
  ])("aceite de convite de turma com %s é rejeitado e não cria ADMIN (003/FR-048)", async (_label, extra) => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const schoolClass = await createClass(t, teacher.id);
    const email = uniqueEmail("invasor");
    const { token } = await createClassInvitation(t, schoolClass.id, email);
    const res = await api(t).post("/api/class-invitations/accept", {
      token,
      name: "Invasor",
      ra: "RA-INVASOR",
      password: "senha-forte-do-invasor",
      ...extra,
    });
    expect(res.status).toBe(400);
    expect(await t.prisma.user.count({ where: { email } })).toBe(0);
    expect(await adminAssignments()).toBe(0);
  });

  it("ativação sem bootstrap emitido não cria ADMIN", async () => {
    const res = await api(t).post("/api/admin-activation", { token: "q".repeat(43), password: "senha-forte-do-invasor" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TOKEN_INVALID");
    expect(await t.prisma.user.count()).toBe(0);
    expect(await adminAssignments()).toBe(0);
  });

  it("verificação de e-mail com campos de papel é rejeitada", async () => {
    const res = await api(t).post("/api/auth/verify-email", { token: "q".repeat(43), role: "ADMIN" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await adminAssignments()).toBe(0);
  });
});
