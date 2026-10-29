import request from "supertest";
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

/** 022 contracts/http-api.md, research Z2: the own account's theme, session access, no audit. */
describe("022/US1 PATCH /me/preferences", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  const themeOf = async (userId: string) =>
    (await t.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { theme: true } })).theme;

  it("022/US1-2 grava LIGHT, responde { theme } e o GET /me reflete", async () => {
    const user = await createUser(t);
    const client = api(t, { cookie: await loginAs(t, user) });
    const res = await client.patch("/api/me/preferences", { theme: "LIGHT" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ theme: "LIGHT" });
    expect((await client.get("/api/me")).body.theme).toBe("LIGHT");
  });

  it("022/US1-4 volta para DARK", async () => {
    const user = await createUser(t);
    const client = api(t, { cookie: await loginAs(t, user) });
    await client.patch("/api/me/preferences", { theme: "LIGHT" });
    const res = await client.patch("/api/me/preferences", { theme: "DARK" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ theme: "DARK" });
    expect(await themeOf(user.id)).toBe("DARK");
  });

  it("022/US1-6 e-mail não confirmado também escolhe o tema", async () => {
    const user = await createUser(t, { verified: false });
    const res = await api(t, { cookie: await loginAs(t, user) }).patch("/api/me/preferences", { theme: "LIGHT" });
    expect(res.status).toBe(200);
    expect(await themeOf(user.id)).toBe("LIGHT");
  });

  it.each([
    ["sem theme", {}],
    ["theme em minúsculas", { theme: "light" }],
    ["theme fora do enum", { theme: "SYSTEM" }],
    ["campo a mais", { theme: "LIGHT", userId: "00000000-0000-0000-0000-000000000000" }],
  ])("022/FR-016 corpo inválido (%s) → 400 sem mudar o banco", async (_label, body) => {
    const user = await createUser(t);
    const res = await api(t, { cookie: await loginAs(t, user) }).patch("/api/me/preferences", body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(await themeOf(user.id)).toBe("DARK");
  });

  it("022/FR-016 corpo vazio ou que não é JSON → 400 sem mudar o banco", async () => {
    const user = await createUser(t);
    const cookie = await loginAs(t, user);
    for (const raw of ["", "theme=LIGHT", "{"]) {
      const res = await request(t.baseUrl)
        .patch("/api/me/preferences")
        .set("Origin", t.origin)
        .set("Cookie", cookie)
        .set("Content-Type", "application/json")
        .send(raw);
      expect(res.status, JSON.stringify(raw)).toBe(400);
    }
    expect(await themeOf(user.id)).toBe("DARK");
  });

  it("022/FR-016 sem sessão → 401", async () => {
    const res = await api(t).patch("/api/me/preferences", { theme: "LIGHT" });
    expect(res.status).toBe(401);
  });

  it("022/FR-016 sem Origin permitido → 403 ORIGIN_NOT_ALLOWED", async () => {
    const user = await createUser(t);
    const cookie = await loginAs(t, user);
    for (const origin of [null, "https://evil.example"]) {
      const res = await api(t, { cookie, origin }).patch("/api/me/preferences", { theme: "LIGHT" });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "ORIGIN_NOT_ALLOWED" });
    }
    expect(await themeOf(user.id)).toBe("DARK");
  });

  it("022/FR-006 muda só o usuário da sessão", async () => {
    const user = await createUser(t);
    const other = await createUser(t);
    await api(t, { cookie: await loginAs(t, user) }).patch("/api/me/preferences", { theme: "LIGHT" });
    expect(await themeOf(user.id)).toBe("LIGHT");
    expect(await themeOf(other.id)).toBe("DARK");
  });

  it("022/FR-015 nenhuma auditoria e nenhuma outra coluna de users muda; repetir o valor responde 200", async () => {
    const user = await createUser(t);
    const client = api(t, { cookie: await loginAs(t, user) });
    const auditsBefore = await t.prisma.auditEvent.count();
    const { theme: _theme, updatedAt: _updatedAt, ...before } = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect((await client.patch("/api/me/preferences", { theme: "LIGHT" })).status).toBe(200);
    const { updatedAt: changedAt } = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const repeated = await client.patch("/api/me/preferences", { theme: "LIGHT" });
    expect(repeated.status).toBe(200);
    expect(repeated.body).toEqual({ theme: "LIGHT" });

    const { theme, updatedAt, ...after } = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(theme).toBe("LIGHT");
    expect(updatedAt, "repetir o valor não reescreve a linha").toEqual(changedAt);
    expect(after).toEqual(before);
    expect(await t.prisma.auditEvent.count()).toBe(auditsBefore);
  });
});
