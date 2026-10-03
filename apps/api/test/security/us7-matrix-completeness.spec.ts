import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS, type PermissionKey, ROLE_KEYS } from "../../src/modules/access-control/permissions";
import { createUser, loginAs } from "../helpers/factories";
import { registeredRoutes } from "../helpers/routes";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { MATRIX, ROLE_PERMISSIONS, routeKey } from "./authorization-matrix";

/**
 * 010, 011 and 012: the migration seeds a feature's permissions in the Foundational phase, before any
 * route exists (010 tasks.md T004/T006, 011 T006, 012 T006); each one leaves this list with the first
 * route that requires it.
 */
const SEEDED_BEFORE_ROUTES = new Set<PermissionKey>(["notas.proprias.visualizar"]);

/** Keeps the authorization matrix honest as routes and seed evolve. */
describe("US7 — completude da matriz e do seed", () => {
  it("toda rota não pública está na matriz exatamente uma vez, e vice-versa", async () => {
    const routes = await registeredRoutes();
    const protectedRoutes = routes.filter((r) => !r.isPublic).map((r) => r.route).sort();
    const inMatrix = MATRIX.map(routeKey);

    expect(new Set(inMatrix).size).toBe(inMatrix.length);
    expect([...inMatrix].sort()).toEqual(protectedRoutes);
  });

  it("toda permissão do catálogo é exigida por pelo menos uma rota", () => {
    const required = new Set(MATRIX.map((entry) => entry.access));
    expect(PERMISSIONS.filter((key) => !required.has(key) && !SEEDED_BEFORE_ROUTES.has(key))).toEqual([]);
  });

  it("010 permissões semeadas antes das rotas ainda não são exigidas por nenhuma (remova-as da lista quando a rota chegar)", () => {
    const required = new Set(MATRIX.map((entry) => entry.access));
    expect([...SEEDED_BEFORE_ROUTES].filter((key) => required.has(key))).toEqual([]);
  });

  describe("seed × contrato", () => {
    let t: TestApp;

    beforeAll(async () => {
      t = await createTestApp();
      await resetDb(t.prisma);
    });
    afterAll(() => t.close());

    it.each(ROLE_KEYS.map((role) => [role]))("%s tem exatamente as permissões do contrato", async (role) => {
      const user = await createUser(t, { roles: [role] });
      const me = await api(t, { cookie: await loginAs(t, user) }).get("/api/me");
      expect(me.status).toBe(200);
      expect(me.body.permissions).toEqual([...ROLE_PERMISSIONS[role]].sort());
    });
  });
});
