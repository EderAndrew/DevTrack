import { Controller, HttpCode, Post } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MOBILE_ACCESS_KEY, MobileOnly, RequirePermissions } from "../../src/modules/access-control/decorators";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { mobileApi, openMobileSession } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** A write only the app may make, as the 025 send route (research N3). */
@Controller("fixture-mobile-only")
class MobileOnlyFixtureController {
  @Post()
  @HttpCode(200)
  @MobileOnly()
  @RequirePermissions("provas.avisos.enviar")
  send() {
    return { ok: true };
  }
}

/**
 * 025 research N3 (025/FR-005): a route marked `@MobileOnly()` refuses a WEB session (the cookie) with
 * `403 MOBILE_SESSION_REQUIRED` before the permission check, accepts the MOBILE bearer and counts as
 * `@MobileAccess()` (the bearer column of the matrix), so the 024 allowlist keeps working unchanged.
 */
describe("025/FR-005 uma rota @MobileOnly() só aceita a sessão do celular", () => {
  let t: TestApp;
  let teacher: TestUser;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [MobileOnlyFixtureController] });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
  });

  it("a sessão da web (cookie) do professor recebe 403 MOBILE_SESSION_REQUIRED", async () => {
    const res = await api(t, { cookie: await loginAs(t, teacher) }).post("/api/fixture-mobile-only", {});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ statusCode: 403, code: "MOBILE_SESSION_REQUIRED" });
  });

  it("o cookie é recusado antes da permissão: um aluno pela web também recebe MOBILE_SESSION_REQUIRED", async () => {
    const student = await createUser(t, { roles: ["STUDENT"] });
    const res = await api(t, { cookie: await loginAs(t, student) }).post("/api/fixture-mobile-only", {});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MOBILE_SESSION_REQUIRED");
  });

  it("o bearer do celular do professor passa; sem a permissão, o bearer recebe 403 FORBIDDEN", async () => {
    const { token } = await openMobileSession(t, teacher);
    const res = await mobileApi(t, token).post("/api/fixture-mobile-only", {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const student = await createUser(t, { roles: ["STUDENT"] });
    const other = await openMobileSession(t, student);
    const refused = await mobileApi(t, other.token).post("/api/fixture-mobile-only", {});
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("FORBIDDEN");
  });

  it("sem sessão é 401, como qualquer rota protegida", async () => {
    const res = await api(t).post("/api/fixture-mobile-only", {});
    expect(res.status).toBe(401);
  });

  it("conta como @MobileAccess(): a coluna do bearer da matriz", () => {
    const reflector = new Reflector();
    const handler = MobileOnlyFixtureController.prototype.send;
    expect(reflector.getAllAndOverride<boolean>(MOBILE_ACCESS_KEY, [handler, MobileOnlyFixtureController])).toBe(true);
  });
});
