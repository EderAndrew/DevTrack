import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type PermissionKey, PERMISSIONS, ROLE_KEYS } from "../../src/modules/access-control/permissions";
import { createUser, loginAs } from "../helpers/factories";
import { registeredRoutes } from "../helpers/routes";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { MATRIX, ROLE_PERMISSIONS, routeKey } from "./authorization-matrix";

/**
 * 003 permissions whose routes are not implemented yet (transitional): each story removes its
 * permissions as its routes land in MATRIX, and the set is deleted when it is empty.
 */
const PENDING_003_PERMISSIONS = new Set<PermissionKey>([
  "turmas.reenviar_convite",
  "turmas.cancelar_convite",
  "turmas.visualizar_alunos",
  "turmas.remover_aluno",
  "turmas.proprias.listar",
]);

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
    expect(PERMISSIONS.filter((key) => !required.has(key) && !PENDING_003_PERMISSIONS.has(key))).toEqual([]);
  });

  it("nenhuma permissão pendente da 003 já tem rota na matriz", () => {
    const required = new Set(MATRIX.map((entry) => entry.access));
    expect([...PENDING_003_PERMISSIONS].filter((key) => required.has(key))).toEqual([]);
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
