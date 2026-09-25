import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_KEYS } from "../../src/modules/access-control/permissions";
import { createUser, loginAs } from "../helpers/factories";
import { registeredRoutes } from "../helpers/routes";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { MATRIX, ROLE_PERMISSIONS, routeKey } from "./authorization-matrix";

/**
 * 006 permissions whose routes are not in the matrix yet; each task that adds routes removes its
 * own, and the list ends empty (006 T059).
 */
const PENDING_006_PERMISSIONS: readonly string[] = [
  "ia.propostas.revisar",
  "ia.operacao.visualizar",
  "ia.agentes.gerenciar",
];

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
    expect(PERMISSIONS.filter((key) => !required.has(key) && !PENDING_006_PERMISSIONS.includes(key))).toEqual([]);
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
