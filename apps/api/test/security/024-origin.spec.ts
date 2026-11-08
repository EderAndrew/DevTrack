import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { expoToken, openMobileSession } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import request from "supertest";

/**
 * 024 research Y4 (024/FR-005): the two exceptions of the CSRF barrier for the app, and nothing more. The
 * app's sign-in (`@MobileEntry()`) accepts a request with no Origin, but an Origin present must be allowed;
 * a bearer request with no session cookie on an `@MobileAccess()` route needs no Origin. Both still need
 * `application/json`. The web routes and the cookie path are unchanged: a browser never adds the bearer by
 * itself, so these requests can't be forged cross-site.
 */
describe("024/FR-005 OriginGuard: as exceções do aplicativo sem enfraquecer a web", () => {
  let t: TestApp;
  let teacher: TestUser;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp({ overrides: [{ provide: LOGIN_DELAY, useValue: async () => {} }] });
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    token = (await openMobileSession(t, teacher)).token;
  });
  afterAll(() => t.close());

  const login = { email: "", password: "" };

  it("o login do app aceita a ausência de Origin; um Origin presente precisa estar na lista", async () => {
    const body = { ...login, email: teacher.email, password: teacher.password };
    expect((await api(t, { origin: null }).post("/api/auth/mobile/sessions", body)).status).toBe(201);
    expect((await api(t, { origin: "https://evil.example" }).post("/api/auth/mobile/sessions", body)).body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect((await api(t).post("/api/auth/mobile/sessions", body)).status).toBe(201);
  });

  it("sem Content-Type JSON o login do app é recusado", async () => {
    const res = await request(t.baseUrl)
      .post("/api/auth/mobile/sessions")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(`email=${encodeURIComponent(teacher.email)}&password=x`);
    expect(res.body.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("bearer sem cookie numa rota do app dispensa o Origin, mas não o JSON", async () => {
    const ok = await api(t, { origin: null, bearer: token }).put("/api/mobile/device", { pushToken: expoToken(), platform: "ANDROID" });
    expect(ok.status).toBe(200);
    const form = await request(t.baseUrl)
      .put("/api/mobile/device")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "text/plain")
      .send("x");
    expect(form.body.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("bearer com cookie de sessão sem Origin é recusado (o caminho do cookie não muda)", async () => {
    const cookie = await loginAs(t, teacher);
    const res = await api(t, { origin: null, bearer: token, cookie }).put("/api/mobile/device", { pushToken: expoToken(), platform: "ANDROID" });
    expect(res.body.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("um Origin estranho junto do bearer é recusado", async () => {
    const res = await api(t, { origin: "https://evil.example", bearer: token }).put("/api/mobile/device", { pushToken: expoToken(), platform: "ANDROID" });
    expect(res.body.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("toda rota da web continua exigindo o Origin, com cookie ou com bearer", async () => {
    const cookie = await loginAs(t, teacher);
    expect((await api(t, { origin: null, cookie }).post("/api/auth/logout")).body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect((await api(t, { origin: null, bearer: token }).post("/api/auth/logout")).body.code).toBe("ORIGIN_NOT_ALLOWED");
    expect((await api(t, { origin: null }).post("/api/auth/login", { email: teacher.email, password: teacher.password })).body.code).toBe(
      "ORIGIN_NOT_ALLOWED",
    );
  });
});
