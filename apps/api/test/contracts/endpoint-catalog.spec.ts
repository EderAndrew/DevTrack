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

  it("cobre as 38 rotas da Fase 001, sem entradas repetidas", () => {
    expect(new Set(catalog).size).toBe(catalog.length);
    expect(catalog).toHaveLength(38);
    expect(routes).toHaveLength(38);
  });
});
