import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, loginAs } from "../helpers/factories";
import { mobileApi, openMobileSession } from "../helpers/mobile";
import { type RegisteredRoute, registeredRoutes } from "../helpers/routes";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** `GET /a/:id` → a concrete URL with random ids, so nothing is found or written. */
const concrete = (route: string) => {
  const [method, path] = route.split(" ") as [string, string];
  return { method, url: `/api${path.replace(/:[A-Za-z]+/g, () => crypto.randomUUID())}` };
};

/**
 * 024 research Y4, contracts/http-api.md (024/FR-005, 024/FR-010): a mobile session's bearer reaches only
 * the routes marked `@MobileAccess()`; on any other route — the hold decisions, attendance and pauses
 * included — it is `403 MOBILE_ROUTE_NOT_ALLOWED`, generated from the registered routes, not by hand.
 * A cookie is a WEB session only and a bearer a MOBILE one.
 */
describe("024/FR-010 024/FR-005 o bearer do celular só vale nas rotas do aplicativo", () => {
  let t: TestApp;
  let routes: RegisteredRoute[];
  let token: string;
  let teacherId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    routes = await registeredRoutes();
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherId = teacher.id;
    token = (await openMobileSession(t, teacher)).token;
  });
  afterAll(() => t.close());

  /** The app's client with the allowed Origin and JSON, so only the session guard decides. */
  const call = (route: string, headers: { bearer?: string; cookie?: string }) => {
    const { method, url } = concrete(route);
    const client = api(t, headers);
    if (method === "GET") return client.get(url);
    if (method === "DELETE") return client.delete(url);
    if (method === "PATCH") return client.patch(url, {});
    if (method === "PUT") return client.put(url, {});
    return client.post(url, {});
  };

  it("as decisões, a chamada e as pausas estão fora da lista do aplicativo", () => {
    const outside = routes.filter((route) => !route.mobileAccess && !route.mobileEntry).map((route) => route.route);
    for (const route of [
      "POST /classes/:classId/activities/:activityId/exam-holds/:holdId/cancel",
      "POST /classes/:classId/activities/:activityId/exam-holds/:holdId/return",
      "POST /classes/:classId/activities/:activityId/exam-holds/:holdId/keep",
      "POST /classes/:classId/activities/:activityId/attendance",
      "POST /classes/:classId/activities/:activityId/students/:studentUserId/pause",
      "POST /auth/logout-all",
    ]) {
      expect(outside).toContain(route);
    }
  });

  it("toda rota sem @MobileAccess responde 403 MOBILE_ROUTE_NOT_ALLOWED ao bearer", async () => {
    const outside = routes.filter((route) => !route.mobileAccess && !route.mobileEntry);
    expect(outside.length).toBeGreaterThan(100);
    const wrong: string[] = [];
    for (const route of outside) {
      const res = await call(route.route, { bearer: token });
      if (res.status !== 403 || res.body?.code !== "MOBILE_ROUTE_NOT_ALLOWED") wrong.push(`${route.route} → ${res.status} ${res.body?.code}`);
    }
    expect(wrong).toEqual([]);
  });

  it("o segredo de uma sessão da web como bearer é 401; o de uma sessão do celular como cookie também", async () => {
    const webCookie = await loginAs(t, { id: teacherId });
    const webSecret = webCookie.split("=")[1]!;
    expect((await mobileApi(t, webSecret).get("/api/me")).status).toBe(401);
    expect((await api(t, { cookie: `__Host-devtrack_session=${token}` }).get("/api/me")).status).toBe(401);
    expect((await mobileApi(t, token).get("/api/me")).status).toBe(200);
  });

  it("com cookie e bearer juntos vale o cookie (uma sessão da web), e o bearer é ignorado", async () => {
    const cookie = await loginAs(t, { id: teacherId });
    // A web-only route: with the cookie, the bearer next to it doesn't make it a mobile request.
    const res = await api(t, { cookie, bearer: token }).get("/api/me/sessions");
    expect(res.status).toBe(200);
    const me = await api(t, { cookie, bearer: "x".repeat(43) }).get("/api/me");
    expect(me.status).toBe(200);
  });
});
