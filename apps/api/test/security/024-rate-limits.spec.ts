import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { createClassWithStudents } from "../helpers/activities";
import { createUser, type TestUser } from "../helpers/factories";
import { examActivity, expoToken, mobileApi, openMobileSession } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const WRONG = "senha-errada-mas-longa";
const IP = "203.0.113.24";

/**
 * 024 contracts/http-api.md "Rate limits": the app's writes (`PUT /mobile/device` and `PUT …/exam-alerts`) share
 * the per-user `mobile-writes` scope, 30 a minute by default — the 31st is `429` with `Retry-After` and changes
 * nothing; the app's sign-in counts in the web login scopes, so failures through either route block both.
 */
describe("024 limites do aplicativo", () => {
  let t: TestApp;
  let teacher: TestUser;

  beforeAll(async () => {
    t = await createTestApp({ overrides: [{ provide: LOGIN_DELAY, useValue: async () => undefined }] });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
  });

  it("a 31ª escrita do aplicativo no minuto, somando celular e silenciar, recebe 429 e nada muda", async () => {
    expect(t.config.rateLimit.mobileWritesPerMinute).toBe(30);
    const { token } = await openMobileSession(t, teacher);
    const created = await createClassWithStudents(t, teacher.id, { students: 0 });
    const { activity } = await examActivity(t, created.schoolClass);
    const mutePath = `/api/classes/${created.schoolClass.id}/activities/${activity.id}/exam-alerts`;
    for (let i = 0; i < 15; i += 1) expect((await mobileApi(t, token).put("/api/mobile/device", { pushToken: expoToken(), platform: "ANDROID" })).status).toBe(200);
    for (let i = 0; i < 15; i += 1) expect((await mobileApi(t, token).put(mutePath, { muted: i % 2 === 1 })).status).toBe(200);
    const lastToken = (await t.prisma.mobileDevice.findFirstOrThrow()).pushToken;

    const device = await mobileApi(t, token).put("/api/mobile/device", { pushToken: expoToken(), platform: "ANDROID" });
    expect(device.status).toBe(429);
    expect(device.body).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
    expect(Number(device.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect((await mobileApi(t, token).put(mutePath, { muted: true })).status).toBe(429);
    expect((await t.prisma.mobileDevice.findFirstOrThrow()).pushToken).toBe(lastToken);
    expect(await t.prisma.examAlertMute.count()).toBe(0);
  });

  it("o limite é por professor: outro professor continua escrevendo", async () => {
    const { token } = await openMobileSession(t, teacher);
    for (let i = 0; i < 30; i += 1) await mobileApi(t, token).put("/api/mobile/device", { pushToken: expoToken(), platform: "ANDROID" });
    expect((await mobileApi(t, token).put("/api/mobile/device", { pushToken: expoToken(), platform: "ANDROID" })).status).toBe(429);
    const other = await openMobileSession(t, await createUser(t, { roles: ["TEACHER"] }));
    expect((await mobileApi(t, other.token).put("/api/mobile/device", { pushToken: expoToken(), platform: "ANDROID" })).status).toBe(200);
  });

  it("o login do app conta nos escopos da web: falhas pelos dois caminhos bloqueiam os dois", async () => {
    const appLogin = (password: string) =>
      api(t, { origin: null }).post("/api/auth/mobile/sessions", { email: teacher.email, password }).set("X-Forwarded-For", IP);
    const webLogin = (password: string) => api(t).post("/api/auth/login", { email: teacher.email, password }).set("X-Forwarded-For", IP);
    for (let i = 0; i < 3; i += 1) expect((await webLogin(WRONG)).status).toBe(401);
    for (let i = 0; i < 2; i += 1) expect((await appLogin(WRONG)).status).toBe(401);
    const app = await appLogin(teacher.password);
    expect([app.status, app.body.code]).toEqual([429, "RATE_LIMITED"]);
    expect((await webLogin(teacher.password)).status).toBe(429);
    expect(await t.prisma.session.count()).toBe(0);
  });
});
