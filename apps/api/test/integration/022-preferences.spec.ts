import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** 022 contracts/http-api.md: the account's theme in `GET /me` and the login's `user`. */
describe("022/FR-003 o tema da conta no /me", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  it("022/FR-003 GET /me de uma conta nova devolve theme DARK", async () => {
    const user = await createUser(t);
    const res = await api(t, { cookie: await loginAs(t, user) }).get("/api/me");
    expect(res.status).toBe(200);
    expect(res.body.theme).toBe("DARK");
  });

  it("022/FR-003 a resposta do login traz user.theme", async () => {
    const user = await createUser(t);
    await t.prisma.user.update({ where: { id: user.id }, data: { theme: "LIGHT" } });
    const res = await api(t).post("/api/auth/login", { email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(res.body.user.theme).toBe("LIGHT");
  });
});
