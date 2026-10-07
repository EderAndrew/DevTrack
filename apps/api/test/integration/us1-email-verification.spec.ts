import { Controller, Get } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RequirePermissions } from "../../src/modules/access-control/decorators";
import { createUser, loginAs, requestVerificationToken, uniqueEmail } from "../helpers/factories";
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

/**
 * Phase 001 US1 without public signup (003 FR-048): accounts come from the factory, unverified,
 * and their verification link from the public resend. The signup scenarios (US1-1, US1-2, US1-6,
 * US1-7) are covered by test/security/003-signup-removed.spec.ts.
 */
describe("US1 — verificação de e-mail (FR-014–FR-016)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [VerifiedOnlyController] });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const verify = (token: string) => api(t).post("/api/auth/verify-email", { token });
  const resend = (email: string) => api(t).post("/api/auth/verify-email/resend", { email });

  /** Unverified account with `email`; returns the verification token sent by e-mail. */
  const unverifiedWithToken = async (email: string) => {
    await createUser(t, { name: "Aluna Teste", email, password: PASSWORD, verified: false });
    return requestVerificationToken(t, email);
  };

  const auditCount = (type: string) => t.prisma.auditEvent.count({ where: { type } });

  describe("US1-3 acesso restrito até verificar", () => {
    it("não verificado: GET /me 200, rota verificada 403; depois de verificar, 200", async () => {
      const email = uniqueEmail("aluna");
      const token = await unverifiedWithToken(email);
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
        // 012: the student's activity and grade permissions (contracts/permissions.md); 015 the AI help.
        permissions: [
          "atividades.proprias.responder",
          "atividades.proprias.visualizar",
          "ia.ajuda.pedir",
          "notas.proprias.visualizar",
          "ranking.turma.visualizar",
          "sessoes.proprias.listar",
          "sessoes.proprias.revogar",
          "turmas.proprias.listar",
        ],
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
      const token = await unverifiedWithToken(email);

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
      const token = await unverifiedWithToken(email);
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
      const token = await unverifiedWithToken(email);
      await t.prisma.$executeRaw`UPDATE user_tokens SET expires_at = now() - interval '1 second'`;
      const res = await verify(token);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "TOKEN_INVALID" });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).toBeNull();
    });

    it("adulterado ou inexistente → TOKEN_INVALID", async () => {
      const token = await unverifiedWithToken(uniqueEmail("aluna"));
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
      const first = await unverifiedWithToken(email);

      const res = await resend(email);
      expect(res.status).toBe(202);
      await t.flushMail();
      const second = t.mailer.lastTokenFor(email, "verify-email")!;
      expect(second).not.toBe(first);

      expect((await verify(first)).body.code).toBe("TOKEN_INVALID");
      expect((await verify(second)).status).toBe(200);
    });
  });
});
