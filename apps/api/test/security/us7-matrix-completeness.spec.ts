import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from "../../src/modules/access-control/permissions";
import { createUser, loginAs } from "../helpers/factories";
import { registeredRoutes } from "../helpers/routes";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { CURRICULUM, MATRIX, ROLE_PERMISSIONS, routeKey } from "./authorization-matrix";

/**
 * 004 permissions whose routes are not in `MATRIX` yet. Each task that adds routes to the matrix
 * removes its permissions from here; the set must be empty when 004 is done.
 */
const PENDING_004_PERMISSIONS = new Set<PermissionKey>(
  CURRICULUM.filter(
    (key) =>
      !["disciplinas.visualizar", "disciplinas.criar", "disciplinas.editar", "ementas.enviar", "ementas.visualizar", "ementas.revisar"].includes(
        key,
      ),
  ),
);

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
    expect(PERMISSIONS.filter((key) => !required.has(key) && !PENDING_004_PERMISSIONS.has(key))).toEqual([]);
  });

  it("uma permissão pendente da 004 sai da lista assim que alguma rota da matriz a exige", () => {
    const required = new Set(MATRIX.map((entry) => entry.access));
    expect([...PENDING_004_PERMISSIONS].filter((key) => required.has(key))).toEqual([]);
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
