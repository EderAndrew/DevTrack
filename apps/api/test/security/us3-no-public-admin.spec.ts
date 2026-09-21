import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module";
import { IS_PUBLIC_KEY } from "../../src/modules/access-control/decorators";
import { uniqueEmail } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

interface Route {
  route: string;
  isPublic: boolean;
}

async function registeredRoutes(): Promise<Route[]> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(testConfig(), { logDestination: new LogCapture() }), DiscoveryModule],
  }).compile();
  const app = await moduleRef.init();
  try {
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);
    const routes: Route[] = [];
    for (const { instance, metatype } of app.get(DiscoveryService).getControllers()) {
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      const base = Reflect.getMetadata(PATH_METADATA, metatype) as string;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name] as () => unknown;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
        routes.push({
          route: `${method} /${base}/${path}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1"),
          isPublic: Boolean(reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype])),
        });
      }
    }
    return routes;
  } finally {
    await app.close();
  }
}

/** FR-030 / US3-8: no public operation creates or promotes an ADMIN. */
describe("US3-8 — nenhuma rota pública produz ADMIN", () => {
  let routes: Route[];
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
    ["isAdmin", { isAdmin: true }],
  ])("cadastro com %s é rejeitado e não cria ADMIN", async (_label, extra) => {
    const res = await api(t).post("/api/auth/signup", {
      name: "Invasor",
      email: uniqueEmail("invasor"),
      password: "senha-forte-do-invasor",
      ...extra,
    });
    expect(res.status).toBe(400);
    expect(await t.prisma.user.count()).toBe(0);
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
