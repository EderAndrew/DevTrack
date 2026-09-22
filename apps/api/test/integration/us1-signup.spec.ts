import { Controller, Get } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RequirePermissions } from "../../src/modules/access-control/decorators";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, loginAs, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** A route that needs a verified e-mail (no `@AllowUnverified`), to exercise FR-016. */
@Controller("fixture-us1")
class VerifiedOnlyController {
  @Get("sessions")
  @RequirePermissions("sessoes.proprias.listar")
  list() {
    return { ok: true };
  }
}

const PASSWORD = "senha-forte-do-aluno-2026";

describe("US1 — cadastro de aluno e verificação de e-mail (FR-010–FR-016)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [VerifiedOnlyController] });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const signup = (body: object) => api(t).post("/api/auth/signup", body);
  const verify = (token: string) => api(t).post("/api/auth/verify-email", { token });
  const resend = (email: string) => api(t).post("/api/auth/verify-email/resend", { email });

  /** Signs up and returns the verification token sent by e-mail. */
  const signupAndGetToken = async (email: string) => {
    const res = await signup({ name: "Aluna Teste", email, password: PASSWORD });
    expect(res.status).toBe(202);
    await t.flushMail();
    const token = t.mailer.lastTokenFor(email, "verify-email");
    expect(token).toBeDefined();
    return token!;
  };

  const auditCount = (type: string) => t.prisma.auditEvent.count({ where: { type } });

  describe("US1-1 cadastro válido", () => {
    it("cria somente STUDENT, perfil, token com hash e envia a verificação", async () => {
      const email = uniqueEmail("aluna");
      const res = await signup({ name: "  Aluna Teste ", email: ` ${email.toUpperCase()} `, password: PASSWORD });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ message: expect.any(String) });

      const user = await t.prisma.user.findUniqueOrThrow({
        where: { email },
        include: { roles: { include: { role: true } }, studentProfile: true, teacherProfile: true, tokens: true },
      });
      expect(user.name).toBe("Aluna Teste");
      expect(user.emailVerifiedAt).toBeNull();
      expect(user.status).toBe("ACTIVE");
      expect(user.passwordHash).not.toContain(PASSWORD);
      expect(user.roles.map((r) => [r.role.key, r.status, r.grantedVia])).toEqual([["STUDENT", "ACTIVE", "SELF_SIGNUP"]]);
      expect(user.studentProfile?.displayName).toBe("Aluna Teste");
      expect(user.teacherProfile).toBeNull();
      expect(user.tokens).toHaveLength(1);
      expect(user.tokens[0]!.purpose).toBe("EMAIL_VERIFICATION");

      const audit = await t.prisma.auditEvent.findMany({ where: { type: "auth.signup" } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorType: "ANONYMOUS", targetType: "USER", targetId: user.id, metadata: {} });

      await t.flushMail();
      const mails = t.mailer.messagesFor(email);
      expect(mails.map((m) => m.template)).toEqual(["verify-email"]);
      const link = t.mailer.lastLinkFor(email, "verify-email")!;
      expect(link.startsWith(`${t.config.webOrigin}/verificar-email?token=`)).toBe(true);
      const token = t.mailer.lastTokenFor(email, "verify-email")!;
      expect(user.tokens[0]!.tokenHash).toBe(hashToken(token));
      expect(user.tokens[0]!.tokenHash).not.toBe(token);
      const hoursValid = (user.tokens[0]!.expiresAt.getTime() - user.tokens[0]!.createdAt.getTime()) / 3_600_000;
      expect(hoursValid).toBeCloseTo(24, 1);
    });
  });

  describe("US1-2 campos de papel e validação", () => {
    const base = () => ({ name: "Invasor", email: uniqueEmail("invasor"), password: PASSWORD });

    it.each([
      ["role", { role: "TEACHER" }],
      ["roles", { roles: ["ADMIN"] }],
      ["permissions", { permissions: ["usuarios.suspender"] }],
      ["isAdmin", { isAdmin: true }],
      ["campo desconhecido", { apelido: "x" }],
    ])("rejeita %s com 400 VALIDATION_ERROR sem criar conta", async (_label, extra) => {
      const res = await signup({ ...base(), ...extra });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
      expect(await t.prisma.user.count()).toBe(0);
    });

    it.each([
      ["sem nome", { name: undefined }],
      ["e-mail inválido", { email: "nao-e-email" }],
      ["sem senha", { password: undefined }],
    ])("rejeita %s com 400 VALIDATION_ERROR", async (_label, override) => {
      const res = await signup({ ...base(), ...override });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(await t.prisma.user.count()).toBe(0);
    });

    it.each([
      ["11 caracteres", "a".repeat(11)],
      ["129 caracteres", "a".repeat(129)],
      ["senha da lista comum (sem diferenciar caixa)", "Unbelievable"],
    ])("rejeita senha com %s como WEAK_PASSWORD", async (_label, password) => {
      const res = await signup({ ...base(), password });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ statusCode: 400, code: "WEAK_PASSWORD" });
      expect(await t.prisma.user.count()).toBe(0);
    });
  });

  describe("US1-3 acesso restrito até verificar", () => {
    it("não verificado: GET /me 200, rota verificada 403; depois de verificar, 200", async () => {
      const email = uniqueEmail("aluna");
      const token = await signupAndGetToken(email);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      const cookie = await loginAs(t, user);

      const me = await api(t, { cookie }).get("/api/me");
      expect(me.status).toBe(200);
      expect(me.body).toEqual({
        id: user.id,
        name: "Aluna Teste",
        email,
        emailVerified: false,
        roles: [{ key: "STUDENT", status: "ACTIVE" }],
        permissions: ["sessoes.proprias.listar", "sessoes.proprias.revogar"],
      });

      const blocked = await api(t, { cookie }).get("/api/fixture-us1/sessions");
      expect(blocked.status).toBe(403);
      expect(blocked.body).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

      expect((await verify(token)).status).toBe(200);

      expect((await api(t, { cookie }).get("/api/fixture-us1/sessions")).status).toBe(200);
      expect((await api(t, { cookie }).get("/api/me")).body.emailVerified).toBe(true);
    });

    it("GET /me sem sessão → 401 UNAUTHENTICATED", async () => {
      const res = await api(t).get("/api/me");
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: "UNAUTHENTICATED" });
    });

    it("GET /me lista todos os papéis com status", async () => {
      const user = await createUser(t, { roles: ["STUDENT", { key: "TEACHER", status: "SUSPENDED" }] });
      const res = await api(t, { cookie: await loginAs(t, user) }).get("/api/me");
      expect(res.body.roles).toEqual([
        { key: "STUDENT", status: "ACTIVE" },
        { key: "TEACHER", status: "SUSPENDED" },
      ]);
    });
  });

  describe("US1-4 verificação e replay (SC-004)", () => {
    it("marca verificado uma vez; replay → 200 sem efeito", async () => {
      const email = uniqueEmail("aluna");
      const token = await signupAndGetToken(email);

      const first = await verify(token);
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ emailVerified: true });
      const { emailVerifiedAt } = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(emailVerifiedAt).not.toBeNull();

      const audit = await t.prisma.auditEvent.findMany({ where: { type: "auth.email_verified" } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorType: "ANONYMOUS", targetType: "USER" });

      const replay = await verify(token);
      expect(replay.status).toBe(200);
      expect(replay.body).toEqual({ emailVerified: true });
      expect(await auditCount("auth.email_verified")).toBe(1);
      const after = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.emailVerifiedAt).toEqual(emailVerifiedAt);
    });

    it("verificação com sessão do próprio usuário audita ator USER", async () => {
      const email = uniqueEmail("aluna");
      const token = await signupAndGetToken(email);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      const res = await api(t, { cookie: await loginAs(t, user) }).post("/api/auth/verify-email", { token });
      expect(res.status).toBe(200);
      const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "auth.email_verified" } });
      expect(audit).toMatchObject({ actorType: "USER", actorUserId: user.id, targetId: user.id });
    });
  });

  describe("US1-5 links inválidos", () => {
    it("expirado → TOKEN_INVALID", async () => {
      const email = uniqueEmail("aluna");
      const token = await signupAndGetToken(email);
      await t.prisma.$executeRaw`UPDATE user_tokens SET expires_at = now() - interval '1 second'`;
      const res = await verify(token);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "TOKEN_INVALID" });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).toBeNull();
    });

    it("adulterado ou inexistente → TOKEN_INVALID", async () => {
      const token = await signupAndGetToken(uniqueEmail("aluna"));
      const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
      expect((await verify(tampered)).body.code).toBe("TOKEN_INVALID");
      expect((await verify("x".repeat(43))).body.code).toBe("TOKEN_INVALID");
    });

    it("formato inválido → VALIDATION_ERROR", async () => {
      const res = await verify("curto");
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("substituído por reenvio → TOKEN_INVALID; o novo funciona", async () => {
      const email = uniqueEmail("aluna");
      const first = await signupAndGetToken(email);

      const res = await resend(email);
      expect(res.status).toBe(202);
      await t.flushMail();
      const second = t.mailer.lastTokenFor(email, "verify-email")!;
      expect(second).not.toBe(first);

      expect((await verify(first)).body.code).toBe("TOKEN_INVALID");
      expect((await verify(second)).status).toBe(200);
    });
  });

  describe("US1-6 e-mail já existente", () => {
    it("mesma resposta pública, nada criado, titular notificado", async () => {
      const owner = await createUser(t, { name: "Titular Original" });
      const before = await t.prisma.user.findUniqueOrThrow({ where: { id: owner.id } });

      const fresh = await signup({ name: "Outra Pessoa", email: uniqueEmail("nova"), password: PASSWORD });
      await t.flushMail();
      t.mailer.clear();
      const signupsBefore = await auditCount("auth.signup");

      const variant = `  ${owner.email.toUpperCase()} `;
      const res = await signup({ name: "Outra Pessoa", email: variant, password: PASSWORD });

      expect(res.status).toBe(fresh.status);
      expect(res.body).toEqual(fresh.body);
      expect(await t.prisma.user.count()).toBe(2);
      expect(await t.prisma.userRole.count({ where: { userId: owner.id } })).toBe(1);
      expect(await t.prisma.userToken.count({ where: { userId: owner.id } })).toBe(0);
      expect(await auditCount("auth.signup")).toBe(signupsBefore);

      const after = await t.prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      expect(after.name).toBe(before.name);
      expect(after.passwordHash).toBe(before.passwordHash);

      await t.flushMail();
      const mails = t.mailer.messagesFor(owner.email);
      expect(mails.map((m) => m.template)).toEqual(["signup-existing-account"]);
      expect(mails[0]!.text).toContain("Titular Original");
      expect(mails[0]!.text).not.toContain("Outra Pessoa");
      expect(mails[0]!.text).toContain(`${t.config.webOrigin}/entrar`);
    });
  });

  describe("US1-7 concorrência (SC-004)", () => {
    it("dois cadastros simultâneos → um User", async () => {
      const email = uniqueEmail("corrida");
      const body = { name: "Corrida", email, password: PASSWORD };
      const results = await Promise.all([signup(body), signup({ ...body, email: email.toUpperCase() })]);
      expect(results.map((r) => r.status)).toEqual([202, 202]);
      expect(results[0]!.body).toEqual(results[1]!.body);
      expect(await t.prisma.user.count({ where: { email } })).toBe(1);
      expect(await t.prisma.userRole.count()).toBe(1);
      expect(await auditCount("auth.signup")).toBe(1);
    });
  });
});
