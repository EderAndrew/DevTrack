import { endpoints } from "@repo/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { registeredRoutes } from "../helpers/routes";

// FR-002 / SC-002: every route of the API has exactly one contract entry, and every entry is a
// real route. Together with ContractConformanceInterceptor this keeps responses and contract in sync.
describe("002/US1-2 002/SC-002 catálogo de endpoints do contrato", () => {
  let routes: string[];
  const catalog = Object.values(endpoints).map((entry) => `${entry.method} ${entry.path}`);

  beforeAll(async () => {
    routes = (await registeredRoutes()).map((route) => route.route);
  });

  it("toda rota registrada no Nest tem uma entrada no catálogo", () => {
    expect(routes.filter((route) => !catalog.includes(route))).toEqual([]);
  });

  it("toda entrada do catálogo corresponde a uma rota registrada", () => {
    expect(catalog.filter((route) => !routes.includes(route))).toEqual([]);
  });

  it("cobre as 37 rotas restantes da Fase 001 (sem o cadastro, 003/FR-048) e as da 003, sem entradas repetidas", () => {
    // 003 domains (classes, class invitations, enrollments, own classes); each story adds its routes.
    const phase003 = Object.keys(endpoints).filter((key) => /^(classes|classInvitations|enrollments|myClasses)\./.test(key));
    expect(new Set(catalog).size).toBe(catalog.length);
    expect(catalog).toHaveLength(37 + phase003.length);
    expect(routes).toHaveLength(37 + phase003.length);
  });
});
