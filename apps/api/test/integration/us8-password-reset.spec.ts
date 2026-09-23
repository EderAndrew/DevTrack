import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, loginAs, requestVerificationToken, type TestUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const NEW_PASSWORD = "nova-senha-muito-segura";

describe("US8 — esqueci minha senha (FR-029a–e)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const request = (email: string) => api(t).post("/api/auth/password-reset/request", { email });
  const confirm = (token: string, password = NEW_PASSWORD) =>
    api(t).post("/api/auth/password-reset/confirm", { token, password });
  const login = (email: string, password: string) => api(t).post("/api/auth/login", { email, password });

  /** Requests a reset for `user` and returns the e-mailed token. */
  const resetToken = async (user: Pick<TestUser, "email">) => {
    expect((await request(user.email)).status).toBe(202);
    await t.flushMail();
    return t.mailer.lastTokenFor(user.email, "password-reset")!;
  };

  it("US8-1 envia link de 1 h só para conta existente e audita sem e-mail", async () => {
    const user = await createUser(t);
    const before = Date.now();
    const res = await request(` ${user.email.toUpperCase()} `);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ message: expect.any(String) });
    await t.flushMail();

    const link = t.mailer.lastLinkFor(user.email, "password-reset")!;
    expect(link.startsWith(`${t.config.webOrigin}/redefinir-senha?token=`)).toBe(true);
    const token = t.mailer.lastTokenFor(user.email, "password-reset")!;
    const row = await t.prisma.userToken.findFirstOrThrow({ where: { userId: user.id, purpose: "PASSWORD_RESET" } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(Math.abs(row.expiresAt.getTime() - (before + 3_600_000))).toBeLessThan(60_000);

    const events = await t.prisma.auditEvent.findMany({ where: { type: "password_reset.requested" } });
    expect(events).toMatchObject([{ actorType: "ANONYMOUS", targetType: "USER", targetId: user.id, metadata: {} }]);

    t.mailer.clear();
    expect((await request(uniqueEmail("ninguem"))).status).toBe(202);
    await t.flushMail();
    expect(t.mailer.outbox).toHaveLength(0);
    expect(await t.prisma.auditEvent.count({ where: { type: "password_reset.requested" } })).toBe(1);

    const extra = await api(t).post("/api/auth/password-reset/request", { email: user.email, role: "ADMIN" });
    expect(extra.status).toBe(400);
  });

  describe("US8-2 redefinição", () => {
    it("troca a senha, revoga todas as sessões e audita; não cria sessão", async () => {
      const user = await createUser(t);
      const sessions = [await loginAs(t, user), await loginAs(t, user)];
      const token = await resetToken(user);

      const res = await confirm(token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: expect.any(String) });
      const cookies = ([] as string[]).concat((res.headers["set-cookie"] as string[] | undefined) ?? []);
      expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(false);

      for (const cookie of sessions) expect((await api(t, { cookie }).get("/api/me")).status).toBe(401);
      expect(await t.prisma.session.count({ where: { userId: user.id, revokeReason: "PASSWORD_RESET" } })).toBe(2);
      expect((await login(user.email, user.password)).body.code).toBe("INVALID_CREDENTIALS");
      expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);

      expect(await t.prisma.auditEvent.findMany({ where: { type: "password_reset.completed" } })).toMatchObject([
        { actorType: "ANONYMOUS", targetType: "USER", targetId: user.id, metadata: { revokedSessions: 2 } },
      ]);
      expect(await t.prisma.auditEvent.count({ where: { type: "session.revoked_all" } })).toBe(0);
    });

    it("senha fraca não consome o link", async () => {
      const user = await createUser(t);
      const token = await resetToken(user);
      const weak = await confirm(token, "curta");
      expect(weak.status).toBe(400);
      expect(weak.body.code).toBe("WEAK_PASSWORD");
      expect((await confirm(token)).status).toBe(200);
    });
  });

  it("US8-3 conta não verificada passa a verificada e o link de verificação pendente morre", async () => {
    const email = uniqueEmail("nao-verificada");
    await createUser(t, { name: "Pessoa", email, password: "senha-inicial-segura", verified: false });
    const verifyToken = await requestVerificationToken(t, email);
    const token = await resetToken({ email });

    expect((await confirm(token)).status).toBe(200);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(await t.prisma.userToken.count({ where: { userId: user.id, usedAt: null, invalidatedAt: null } })).toBe(0);
    expect((await api(t).post("/api/auth/verify-email", { token: verifyToken })).body.code).toBe("TOKEN_INVALID");
  });

  describe("US8-4 links inutilizáveis", () => {
    it("usado, expirado, adulterado e substituído → mesmo TOKEN_INVALID", async () => {
      const used = await createUser(t);
      const usedToken = await resetToken(used);
      expect((await confirm(usedToken)).status).toBe(200);

      const expired = await createUser(t);
      const expiredToken = await resetToken(expired);
      await t.prisma.$executeRaw`UPDATE user_tokens SET expires_at = now() - interval '1 second' WHERE user_id = ${expired.id}::uuid`;

      const replaced = await createUser(t);
      const oldToken = await resetToken(replaced);
      await resetToken(replaced);

      const tampered = `${usedToken.slice(0, -2)}zz`;
      const bodies = [];
      for (const token of [usedToken, expiredToken, oldToken, tampered]) {
        const res = await confirm(token);
        expect(res.status).toBe(400);
        bodies.push(JSON.stringify(res.body));
      }
      expect(new Set(bodies).size).toBe(1);
      expect(JSON.parse(bodies[0]!).code).toBe("TOKEN_INVALID");

      const bad = await confirm("curto");
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe("VALIDATION_ERROR");
    });

    it("ainda válido a 1 s do fim da validade", async () => {
      const user = await createUser(t);
      const token = await resetToken(user);
      await t.prisma.$executeRaw`UPDATE user_tokens SET expires_at = now() + interval '1 second' WHERE user_id = ${user.id}::uuid`;
      expect((await confirm(token)).status).toBe(200);
    });

    it("duas confirmações simultâneas → uma só", async () => {
      const user = await createUser(t);
      const token = await resetToken(user);
      const results = await Promise.all([confirm(token, NEW_PASSWORD), confirm(token, "outra-senha-muito-segura")]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await t.prisma.auditEvent.count({ where: { type: "password_reset.completed" } })).toBe(1);
    });
  });

  it("US8-5 conta suspensa continua suspensa e sem mudança de papéis", async () => {
    const user = await createUser(t, { roles: ["TEACHER", "MANAGER"], status: "SUSPENDED" });
    const rolesBefore = await t.prisma.userRole.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } });
    const token = await resetToken(user);

    expect((await confirm(token)).status).toBe(200);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("SUSPENDED");
    expect((await login(user.email, NEW_PASSWORD)).body.code).toBe("ACCOUNT_SUSPENDED");
    const rolesAfter = await t.prisma.userRole.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } });
    expect(rolesAfter.map((r) => [r.roleId, r.status])).toEqual(rolesBefore.map((r) => [r.roleId, r.status]));
  });
});
