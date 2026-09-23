import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, requestVerificationToken, uniqueEmail } from "../helpers/factories";
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

  const resend = (email: string) => api(t).post("/api/auth/verify-email/resend", { email });

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
    const { email } = await createUser(t, { email: uniqueEmail("segredo"), password: PASSWORD, verified: false });
    const token = await requestVerificationToken(t, email);
    await api(t).post("/api/auth/verify-email", { token });
    await resend(email);
    await api(t).post("/api/auth/login", { email, password: PASSWORD });
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

describe("US1 — rate limit do reenvio de verificação (FR-022)", () => {
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

  const resend = (email: string) => api(t).post("/api/auth/verify-email/resend", { email });

  const expectRateLimited = (res: { status: number; body: { code?: string }; headers: Record<string, string> }) => {
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
    const retryAfter = Number(res.headers["retry-after"]);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
  };

  it("reenvio: 3ª solicitação ao mesmo e-mail → 429, igual para existente e inexistente", async () => {
    const call = resend;
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

    // Nothing is created: only the owner exists.
    expect(await t.prisma.user.count()).toBe(1);
  });

  it("limite por origem com e-mails distintos → 429 e auditoria sem dados pessoais", async () => {
    for (let i = 0; i < 6; i += 1) expect((await resend(uniqueEmail(`origem${i}`))).status).toBe(202);
    const { email } = await createUser(t, { email: uniqueEmail("bloqueada"), verified: false });
    expectRateLimited(await resend(email));
    await t.flushMail();
    expect(t.mailer.messagesFor(email)).toHaveLength(0);

    const events = await t.prisma.auditEvent.findMany({ where: { type: "auth.rate_limit.blocked" } });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toMatchObject({ actorType: "ANONYMOUS", metadata: { scope: "resend_origin" } });
    const serialized = serialize(events);
    expect(serialized).not.toContain(email);
    expect(serialized).not.toMatch(/127\.0\.0\.1|::1/);
  });
});
