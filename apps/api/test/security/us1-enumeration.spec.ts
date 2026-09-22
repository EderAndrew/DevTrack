import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, uniqueEmail } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

/** Audit ids are BigInt. */
const serialize = (value: unknown) => JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

const PASSWORD = "senha-forte-do-aluno-2026";

/** Everything a client can observe except per-request identifiers. */
function publicShape(res: { status: number; body: unknown; headers: Record<string, string> }) {
  const { "x-request-id": _id, date: _date, etag: _etag, ...headers } = res.headers;
  return { status: res.status, body: res.body, headers };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe("US1 — anti-enumeração, reenvio e segredos (SC-006, FR-015)", () => {
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

  const signup = (email: string) => api(t).post("/api/auth/signup", { name: "Pessoa", email, password: PASSWORD });
  const resend = (email: string) => api(t).post("/api/auth/verify-email/resend", { email });

  it("cadastro: e-mail novo × existente (verificado e não verificado) são indistinguíveis", async () => {
    const verified = await createUser(t);
    const unverified = await createUser(t, { verified: false });
    const responses = [
      await signup(uniqueEmail("nova")),
      await signup(verified.email),
      await signup(unverified.email),
    ].map(publicShape);
    expect(responses[0]!.status).toBe(202);
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[2]).toEqual(responses[0]);
  });

  it("cadastro: mediana de latência na mesma ordem de grandeza (hash também no caminho existente)", async () => {
    const existing = await Promise.all(Array.from({ length: 5 }, () => createUser(t)));
    const timed = async (email: string) => {
      const start = performance.now();
      const res = await signup(email);
      expect(res.status).toBe(202);
      return performance.now() - start;
    };
    // Warm-up so JIT/connection setup does not skew the first sample.
    await timed(uniqueEmail("aquecimento"));

    const fresh: number[] = [];
    const taken: number[] = [];
    for (const user of existing) {
      fresh.push(await timed(uniqueEmail("nova")));
      taken.push(await timed(user.email));
    }
    const ratio = median(fresh) / median(taken);
    expect(ratio).toBeGreaterThan(1 / 3);
    expect(ratio).toBeLessThan(3);
  });

  it("reenvio: resposta idêntica; só a conta não verificada recebe link e o anterior é invalidado", async () => {
    const verified = await createUser(t);
    const unverified = await createUser(t, { verified: false });
    await t.prisma.runInTransaction(async (tx) => {
      await tx.userToken.create({
        data: {
          userId: unverified.id,
          purpose: "EMAIL_VERIFICATION",
          tokenHash: hashToken("token-anterior"),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
    });

    const responses = [
      await resend(uniqueEmail("ninguem")),
      await resend(verified.email),
      await resend(` ${unverified.email.toUpperCase()}`),
    ].map(publicShape);
    expect(responses[0]!.status).toBe(202);
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[2]).toEqual(responses[0]);

    await t.flushMail();
    expect(t.mailer.messagesFor(verified.email)).toHaveLength(0);
    expect(t.mailer.messagesFor(unverified.email).map((m) => m.template)).toEqual(["verify-email"]);
    expect(t.mailer.outbox).toHaveLength(1);

    const previous = await t.prisma.userToken.findUniqueOrThrow({ where: { tokenHash: hashToken("token-anterior") } });
    expect(previous.invalidatedAt).not.toBeNull();
    expect(await t.prisma.userToken.count({ where: { userId: unverified.id, invalidatedAt: null } })).toBe(1);
  });

  it("logs e auditoria não contêm senha, token do link nem hash do token (SC-005)", async () => {
    logs.clear();
    const email = uniqueEmail("segredo");
    await signup(email);
    await t.flushMail();
    const token = t.mailer.lastTokenFor(email, "verify-email")!;
    await api(t).post("/api/auth/verify-email", { token });
    await resend(email);
    await signup(email);
    await t.flushMail();

    const audit = serialize(await t.prisma.auditEvent.findMany());
    const text = logs.text();
    for (const secret of [PASSWORD, token, hashToken(token)]) {
      expect(text).not.toContain(secret);
      expect(audit).not.toContain(secret);
    }
    expect(audit).not.toContain(email);
  });
});

describe("US1 — rate limit de cadastro e reenvio (FR-022)", () => {
  let t: TestApp;

  beforeAll(async () => {
    const base = testConfig();
    t = await createTestApp({ config: { rateLimit: { ...base.rateLimit, publicTarget: 2, publicOrigin: 6 } } });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const signup = (email: string) => api(t).post("/api/auth/signup", { name: "Pessoa", email, password: PASSWORD });
  const resend = (email: string) => api(t).post("/api/auth/verify-email/resend", { email });

  const expectRateLimited = (res: { status: number; body: { code?: string }; headers: Record<string, string> }) => {
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
    const retryAfter = Number(res.headers["retry-after"]);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
  };

  it.each([
    ["cadastro", "signup"],
    ["reenvio", "resend"],
  ])("%s: 3ª solicitação ao mesmo e-mail → 429, igual para existente e inexistente", async (_label, route) => {
    const call = route === "signup" ? signup : resend;
    const owner = await createUser(t, { verified: false });
    const nobody = uniqueEmail("ninguem");

    for (const email of [owner.email, nobody]) {
      expect((await call(email)).status).toBe(202);
      expect((await call(email)).status).toBe(202);
    }
    const blockedOwner = await call(owner.email);
    const blockedNobody = await call(nobody);
    expectRateLimited(blockedOwner);
    expectRateLimited(blockedNobody);
    // Retry-After may differ by a second at a window boundary; everything else is identical.
    const withoutRetry = (res: typeof blockedOwner) => {
      const { "retry-after": _retry, ...headers } = publicShape(res).headers;
      return { ...publicShape(res), headers };
    };
    expect(withoutRetry(blockedNobody)).toEqual(withoutRetry(blockedOwner));
    expect(Math.abs(Number(blockedNobody.headers["retry-after"]) - Number(blockedOwner.headers["retry-after"]))).toBeLessThanOrEqual(1);

    // Nothing is created after the block: only the owner and, for signup, the first `nobody`.
    expect(await t.prisma.user.count()).toBe(route === "signup" ? 2 : 1);
  });

  it("limite por origem com e-mails distintos → 429 e auditoria sem dados pessoais", async () => {
    for (let i = 0; i < 6; i += 1) expect((await signup(uniqueEmail(`origem${i}`))).status).toBe(202);
    const email = uniqueEmail("bloqueada");
    expectRateLimited(await signup(email));
    expect(await t.prisma.user.count({ where: { email } })).toBe(0);

    const events = await t.prisma.auditEvent.findMany({ where: { type: "auth.rate_limit.blocked" } });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toMatchObject({ actorType: "ANONYMOUS", metadata: { scope: "signup_origin" } });
    const serialized = serialize(events);
    expect(serialized).not.toContain(email);
    expect(serialized).not.toMatch(/127\.0\.0\.1|::1/);
  });
});
