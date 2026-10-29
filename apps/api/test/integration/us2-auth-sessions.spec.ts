import * as argon2 from "argon2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, DEFAULT_PASSWORD, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const DAY_MS = 24 * 3600 * 1000;

/** `Set-Cookie` of the session cookie, if the response has one. */
function sessionSetCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : [];
  return list.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
}

function secretOf(setCookie: string): string {
  return setCookie.slice(SESSION_COOKIE_NAME.length + 1).split(";")[0]!;
}

function expiresOf(setCookie: string): Date {
  const match = /Expires=([^;]+)/i.exec(setCookie);
  return new Date(match![1]!);
}

describe("US2 — login, logout e sessões próprias (FR-020–FR-028)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  const login = (email: string, password: string, cookie?: string) =>
    api(t, { cookie }).post("/api/auth/login", { email, password });

  /** Logs in over HTTP and returns the Cookie header value. */
  const loginCookie = async (user: TestUser) => {
    const res = await login(user.email, user.password);
    expect(res.status).toBe(200);
    return `${SESSION_COOKIE_NAME}=${secretOf(sessionSetCookie(res)!)}`;
  };

  const sessionIdOf = async (cookie: string) => {
    const secret = cookie.split("=")[1]!;
    return (await t.prisma.session.findUniqueOrThrow({ where: { tokenHash: hashToken(secret) } })).id;
  };

  const status = async (cookie: string) => (await api(t, { cookie }).get("/api/me/sessions")).status;

  describe("US2-1 login válido", () => {
    it("cria sessão, cookie __Host- com flags corretas e devolve MeView", async () => {
      const user = await createUser(t, { name: "Pessoa Login" });
      const before = Date.now();
      const res = await login(`  ${user.email.toUpperCase()} `, user.password);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: {
          id: user.id,
          name: "Pessoa Login",
          email: user.email,
          emailVerified: true,
          roles: [{ key: "STUDENT", status: "ACTIVE" }],
          // 012: the student's activity and grade permissions (contracts/permissions.md); 015 the AI help; 020 the feedback.
          permissions: [
            "atividades.proprias.executar",
            "atividades.proprias.responder",
            "atividades.proprias.visualizar",
            "feedbacks.enviar",
            "feedbacks.proprios.listar",
            "ia.ajuda.pedir",
            "notas.proprias.visualizar",
            "ranking.turma.visualizar",
            "sessoes.proprias.listar",
            "sessoes.proprias.revogar",
            "turmas.proprias.listar",
          ],
          // 022: the account's theme, DARK by default.
          theme: "DARK",
        },
      });

      const setCookie = sessionSetCookie(res)!;
      expect(setCookie).toBeDefined();
      expect(setCookie).toMatch(/; Path=\//);
      expect(setCookie).toMatch(/; HttpOnly/);
      expect(setCookie).toMatch(/; Secure/);
      expect(setCookie).toMatch(/; SameSite=Lax/);
      expect(setCookie).not.toMatch(/Domain=/i);
      const expires = expiresOf(setCookie).getTime();
      expect(Math.abs(expires - (before + 7 * DAY_MS))).toBeLessThan(60_000);

      const secret = secretOf(setCookie);
      expect(JSON.stringify(res.body)).not.toContain(secret);
      const session = await t.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.tokenHash).toBe(hashToken(secret));

      expect(await status(`${SESSION_COOKIE_NAME}=${secret}`)).toBe(200);

      const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "auth.login.succeeded" } });
      expect(audit).toMatchObject({
        actorType: "USER",
        actorUserId: user.id,
        targetType: "SESSION",
        targetId: session.id,
        metadata: { sessionId: session.id },
      });
    });

    it("conta não verificada também entra (acesso restrito, FR-016)", async () => {
      const user = await createUser(t, { verified: false });
      const res = await login(user.email, user.password);
      expect(res.status).toBe(200);
      expect(res.body.user.emailVerified).toBe(false);
      const cookie = `${SESSION_COOKIE_NAME}=${secretOf(sessionSetCookie(res)!)}`;
      expect((await api(t, { cookie }).get("/api/me/sessions")).body.code).toBe("EMAIL_NOT_VERIFIED");
      expect((await api(t, { cookie }).get("/api/me")).status).toBe(200);
    });
  });

  describe("US2-2 credenciais inválidas", () => {
    it("e-mail inexistente e senha errada têm a mesma resposta e não criam sessão", async () => {
      const user = await createUser(t);
      const unknown = await login("ninguem@example.test", DEFAULT_PASSWORD);
      const wrong = await login(user.email, "senha-errada-mas-longa");

      expect(unknown.status).toBe(401);
      expect(unknown.body).toEqual({ statusCode: 401, code: "INVALID_CREDENTIALS", message: expect.any(String) });
      expect(wrong.status).toBe(unknown.status);
      expect(wrong.body).toEqual(unknown.body);
      expect(sessionSetCookie(unknown)).toBeUndefined();
      expect(sessionSetCookie(wrong)).toBeUndefined();
      expect(await t.prisma.session.count()).toBe(0);
    });

    it("campo extra → 400 VALIDATION_ERROR", async () => {
      const user = await createUser(t);
      const res = await api(t).post("/api/auth/login", { email: user.email, password: user.password, remember: true });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  it("login não reaproveita o cookie enviado (sem session fixation)", async () => {
    const other = await createUser(t);
    const otherCookie = await loginAs(t, other);
    const user = await createUser(t);

    const res = await login(user.email, user.password, otherCookie);
    expect(res.status).toBe(200);
    const secret = secretOf(sessionSetCookie(res)!);
    expect(`${SESSION_COOKIE_NAME}=${secret}`).not.toBe(otherCookie);
    expect(await status(otherCookie)).toBe(200);
  });

  describe("US2-5 logout (SC-007)", () => {
    it("invalida só a sessão atual e limpa o cookie", async () => {
      const user = await createUser(t);
      const first = await loginCookie(user);
      const second = await loginCookie(user);
      const firstId = await sessionIdOf(first);

      const res = await api(t, { cookie: first }).post("/api/auth/logout");
      expect(res.status).toBe(204);
      const cleared = sessionSetCookie(res)!;
      expect(expiresOf(cleared).getTime()).toBeLessThan(Date.now());

      expect(await status(first)).toBe(401);
      expect(await status(second)).toBe(200);
      expect((await api(t, { cookie: first }).post("/api/auth/logout")).status).toBe(401);

      const audit = await t.prisma.auditEvent.findMany({ where: { type: "session.revoked" } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorUserId: user.id, targetId: firstId, metadata: { reason: "LOGOUT" } });
    });

    it("usuário não verificado consegue sair", async () => {
      const user = await createUser(t, { verified: false });
      const cookie = await loginCookie(user);
      expect((await api(t, { cookie }).post("/api/auth/logout")).status).toBe(204);
      expect((await api(t, { cookie }).get("/api/me")).status).toBe(401);
    });
  });

  it("US2-6 logout-all invalida todas, inclusive a atual (SC-007)", async () => {
    const user = await createUser(t);
    const cookies = [await loginCookie(user), await loginCookie(user), await loginCookie(user)];

    const res = await api(t, { cookie: cookies[0] }).post("/api/auth/logout-all");
    expect(res.status).toBe(204);
    expect(sessionSetCookie(res)).toBeDefined();
    for (const cookie of cookies) expect(await status(cookie)).toBe(401);

    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "session.revoked_all" } });
    expect(audit).toMatchObject({ actorType: "USER", actorUserId: user.id, metadata: { reason: "LOGOUT_ALL", count: 3 } });
  });

  describe("US2-7 listar e revogar as próprias sessões", () => {
    it("lista só as ativas, marca a atual e calcula expiresAt", async () => {
      const user = await createUser(t);
      const current = await loginCookie(user);
      const other = await loginCookie(user);
      const revoked = await loginCookie(user);
      const expired = await loginCookie(user);
      await api(t, { cookie: revoked }).post("/api/auth/logout");
      await t.prisma.session.update({
        where: { id: await sessionIdOf(expired) },
        data: { absoluteExpiresAt: new Date(Date.now() - 1000) },
      });

      const res = await api(t, { cookie: current }).get("/api/me/sessions");
      expect(res.status).toBe(200);
      const items = res.body.items as Record<string, unknown>[];
      expect(items.map((item) => item.id).sort()).toEqual([await sessionIdOf(current), await sessionIdOf(other)].sort());
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(["createdAt", "current", "expiresAt", "id", "lastUsedAt"]);
        const idle = new Date(item.lastUsedAt as string).getTime() + 8 * 3600 * 1000;
        expect(new Date(item.expiresAt as string).getTime()).toBe(idle);
      }
      expect(items.filter((item) => item.current).map((item) => item.id)).toEqual([await sessionIdOf(current)]);
      expect(JSON.stringify(res.body)).not.toContain(current.split("=")[1]!);

      const one = await api(t, { cookie: current }).get(`/api/me/sessions/${await sessionIdOf(other)}`);
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({ id: await sessionIdOf(other), current: false });
    });

    it("revoga uma específica, de forma idempotente", async () => {
      const user = await createUser(t);
      const current = await loginCookie(user);
      const other = await loginCookie(user);
      const otherId = await sessionIdOf(other);

      const res = await api(t, { cookie: current }).delete(`/api/me/sessions/${otherId}`);
      expect(res.status).toBe(204);
      expect(sessionSetCookie(res)).toBeUndefined();
      expect(await status(other)).toBe(401);
      expect(await status(current)).toBe(200);
      expect((await api(t, { cookie: current }).delete(`/api/me/sessions/${otherId}`)).status).toBe(204);

      const audit = await t.prisma.auditEvent.findMany({ where: { type: "session.revoked" } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ targetId: otherId, metadata: { reason: "USER_REVOKED" } });
    });

    it("revogar a sessão atual limpa o cookie", async () => {
      const user = await createUser(t);
      const current = await loginCookie(user);
      const res = await api(t, { cookie: current }).delete(`/api/me/sessions/${await sessionIdOf(current)}`);
      expect(res.status).toBe(204);
      expect(sessionSetCookie(res)).toBeDefined();
      expect(await status(current)).toBe(401);
    });

    it("id que não é UUID → 400 VALIDATION_ERROR", async () => {
      const cookie = await loginCookie(await createUser(t));
      const res = await api(t, { cookie }).get("/api/me/sessions/abc");
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  it("US2-8 sessão de outro usuário → 404 igual ao inexistente, e continua válida", async () => {
    const owner = await createUser(t);
    const ownerCookie = await loginCookie(owner);
    const ownerSessionId = await sessionIdOf(ownerCookie);
    const intruder = await loginCookie(await createUser(t));

    const missing = await api(t, { cookie: intruder }).get("/api/me/sessions/00000000-0000-4000-8000-000000000000");
    const get = await api(t, { cookie: intruder }).get(`/api/me/sessions/${ownerSessionId}`);
    const del = await api(t, { cookie: intruder }).delete(`/api/me/sessions/${ownerSessionId}`);

    expect(missing.status).toBe(404);
    expect(get.status).toBe(404);
    expect(del.status).toBe(404);
    expect(get.body).toEqual(missing.body);
    expect(del.body).toEqual(missing.body);
    expect(await status(ownerCookie)).toBe(200);
  });

  describe("US2-9 sessões expiradas", () => {
    it("inatividade de mais de 8 h → 401", async () => {
      const cookie = await loginCookie(await createUser(t));
      await t.prisma.$executeRaw`UPDATE sessions SET last_used_at = now() - interval '8 hours 1 minute'`;
      const res = await api(t, { cookie }).get("/api/me/sessions");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("UNAUTHENTICATED");
    });

    it("mais de 7 dias desde a criação → 401", async () => {
      const cookie = await loginCookie(await createUser(t));
      await t.prisma.$executeRaw`UPDATE sessions SET absolute_expires_at = now() - interval '1 second'`;
      expect(await status(cookie)).toBe(401);
    });
  });

  describe("US2-10 conta suspensa (SC-007)", () => {
    it("senha correta → 403 ACCOUNT_SUSPENDED sem sessão; senha errada → 401", async () => {
      const user = await createUser(t, { status: "SUSPENDED" });
      const right = await login(user.email, user.password);
      expect(right.status).toBe(403);
      expect(right.body.code).toBe("ACCOUNT_SUSPENDED");
      expect(sessionSetCookie(right)).toBeUndefined();
      expect((await login(user.email, "senha-errada-mas-longa")).body.code).toBe("INVALID_CREDENTIALS");
      expect(await t.prisma.session.count()).toBe(0);
    });

    it("sessão existente de conta suspensa → 401", async () => {
      const user = await createUser(t);
      const cookie = await loginCookie(user);
      await t.prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
      expect(await status(cookie)).toBe(401);
    });
  });

  it("rehash: hash com parâmetros antigos é atualizado no login", async () => {
    const user = await createUser(t);
    const weak = await argon2.hash(user.password, { type: argon2.argon2id, memoryCost: 4096, timeCost: 1, parallelism: 1 });
    await t.prisma.user.update({ where: { id: user.id }, data: { passwordHash: weak } });

    expect((await login(user.email, user.password)).status).toBe(200);
    const { passwordHash } = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(passwordHash).not.toBe(weak);
    expect(passwordHash).toMatch(/m=19456/);
    expect((await login(user.email, user.password)).status).toBe(200);
  });
});
