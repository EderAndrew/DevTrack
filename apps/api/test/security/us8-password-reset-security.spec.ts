import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, uniqueEmail } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const NEW_PASSWORD = "nova-senha-muito-segura";
const serialize = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

function publicShape(res: { status: number; body: unknown; headers: Record<string, string> }) {
  const { "x-request-id": _id, date: _date, etag: _etag, "retry-after": _retry, ...headers } = res.headers;
  return { status: res.status, body: res.body, headers };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe("US8 — anti-enumeração e segredos (SC-005, SC-006)", () => {
  let t: TestApp;
  const logs = new LogCapture();

  beforeAll(async () => {
    t = await createTestApp({ logs });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const request = (email: string) => api(t).post("/api/auth/password-reset/request", { email });

  it("existente e inexistente: mesma resposta e mesma ordem de grandeza de tempo", async () => {
    const users = await Promise.all(Array.from({ length: 5 }, () => createUser(t)));
    expect(publicShape(await request(users[0]!.email))).toEqual(publicShape(await request(uniqueEmail("ninguem"))));

    const timed = async (email: string) => {
      const start = performance.now();
      expect((await request(email)).status).toBe(202);
      return performance.now() - start;
    };
    await timed(uniqueEmail("aquecimento"));
    const existing: number[] = [];
    const missing: number[] = [];
    for (const user of users.slice(1)) {
      existing.push(await timed(user.email));
      missing.push(await timed(uniqueEmail("ninguem")));
    }
    const ratio = median(existing) / median(missing);
    expect(ratio).toBeGreaterThan(1 / 3);
    expect(ratio).toBeLessThan(3);
  });

  it("logs e auditoria sem senha, token ou hash do token", async () => {
    logs.clear();
    const user = await createUser(t);
    await request(user.email);
    await t.flushMail();
    const token = t.mailer.lastTokenFor(user.email, "password-reset")!;
    expect((await api(t).post("/api/auth/password-reset/confirm", { token, password: NEW_PASSWORD })).status).toBe(200);

    const audit = serialize(await t.prisma.auditEvent.findMany());
    for (const secret of [NEW_PASSWORD, token, hashToken(token)]) {
      expect(logs.text()).not.toContain(secret);
      expect(audit).not.toContain(secret);
    }
    expect(audit).not.toContain(user.email);
  });
});

describe("US8-6 rate limit da recuperação (FR-029e, FR-022)", () => {
  let t: TestApp;

  beforeAll(async () => {
    const base = testConfig();
    t = await createTestApp({ config: { rateLimit: { ...base.rateLimit, publicTarget: 2 } } });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const request = (email: string) => api(t).post("/api/auth/password-reset/request", { email });

  it("3ª solicitação ao mesmo e-mail → 429 igual para existente e inexistente, sem e-mail a mais", async () => {
    const user = await createUser(t);
    const nobody = uniqueEmail("ninguem");
    for (const email of [user.email, nobody]) {
      expect((await request(email)).status).toBe(202);
      expect((await request(email)).status).toBe(202);
    }
    const blockedOwner = await request(user.email);
    const blockedNobody = await request(nobody);
    expect(blockedOwner.status).toBe(429);
    expect(blockedOwner.body.code).toBe("RATE_LIMITED");
    expect(Number(blockedOwner.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(publicShape(blockedNobody)).toEqual(publicShape(blockedOwner));

    await t.flushMail();
    expect(t.mailer.messagesFor(user.email)).toHaveLength(2);
  });

  it("3ª confirmação com o mesmo token inválido → 429", async () => {
    const token = "r".repeat(43);
    for (let i = 0; i < 2; i += 1) {
      const res = await api(t).post("/api/auth/password-reset/confirm", { token, password: NEW_PASSWORD });
      expect(res.body.code).toBe("TOKEN_INVALID");
    }
    const blocked = await api(t).post("/api/auth/password-reset/confirm", { token, password: NEW_PASSWORD });
    expect(blocked.status).toBe(429);

    const scopes = (await t.prisma.auditEvent.findMany({ where: { type: "auth.rate_limit.blocked" } })).map(
      (e) => (e.metadata as { scope: string }).scope,
    );
    expect(scopes).toContain("password_reset_confirm_token");
  });

  it("bloqueio de solicitação auditado com o escopo, sem e-mail nem IP", async () => {
    const email = uniqueEmail("alvo");
    for (let i = 0; i < 3; i += 1) await request(email);
    const events = await t.prisma.auditEvent.findMany({ where: { type: "auth.rate_limit.blocked" } });
    expect(events.map((e) => (e.metadata as { scope: string }).scope)).toEqual(["password_reset_email"]);
    const text = serialize(events);
    expect(text).not.toContain(email);
    expect(text).not.toMatch(/127\.0\.0\.1|::1/);
  });
});
