import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AdminBootstrapService,
  type BootstrapResult,
} from "../../src/modules/admin-bootstrap/admin-bootstrap.service";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, loginAs, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { ROLE_PERMISSIONS } from "../security/authorization-matrix";

const OPERATOR = { host: "host-teste", user: "operador" };
const OPERATOR_META = { operatorHost: "host-teste", operatorUser: "operador" };
const PASSWORD = "senha-forte-do-admin-2026";
const serialize = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

describe("US3 — bootstrap do primeiro ADMIN (FR-030–FR-036, R14)", () => {
  let t: TestApp;
  let bootstrap: AdminBootstrapService;

  beforeAll(async () => {
    t = await createTestApp();
    bootstrap = t.get(AdminBootstrapService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const run = (email: string, printLink = false) => bootstrap.run({ email, printLink, operator: OPERATOR });
  const tokenFor = (email: string) => t.mailer.lastTokenFor(email, "admin-activation");
  const preview = (token: string, cookie?: string) => api(t, { cookie }).post("/api/admin-activation/preview", { token });
  const activate = (body: object, cookie?: string) => api(t, { cookie }).post("/api/admin-activation", body);
  const adminRoles = () => t.prisma.userRole.findMany({ where: { role: { key: "ADMIN" } } });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  /** Runs the bootstrap for an e-mail without account and returns the e-mailed token. */
  const pending = async (email: string) => {
    const result = await run(email);
    expect(result.outcome).toBe("PENDING");
    return tokenFor(email)!;
  };

  describe("US3-1 e-mail sem conta", () => {
    it("cria PENDING, envia o link e só cria User/ADMIN na ativação", async () => {
      const email = uniqueEmail("admin");
      const before = Date.now();
      const result = await run(` ${email.toUpperCase()} `);

      expect(result).toMatchObject({ outcome: "PENDING", mailDelivered: true, cancelledPrevious: false });
      expect("link" in result && result.link).toBeFalsy();
      const row = await t.prisma.adminBootstrap.findFirstOrThrow();
      expect(row).toMatchObject({ email, status: "PENDING", linkPrinted: false, operatorHost: "host-teste", operatorUser: "operador" });
      expect(Math.abs(row.expiresAt!.getTime() - (before + 24 * 3600 * 1000))).toBeLessThan(60_000);

      const link = t.mailer.lastLinkFor(email, "admin-activation")!;
      expect(link.startsWith(`${t.config.webOrigin}/ativar-admin?token=`)).toBe(true);
      const token = tokenFor(email)!;
      expect(row.tokenHash).toBe(hashToken(token));
      expect(await t.prisma.user.count()).toBe(0);
      expect(await adminRoles()).toHaveLength(0);

      const p = await preview(token);
      expect(p.status).toBe(200);
      expect(p.body).toEqual({ email, mode: "CREATE_ACCOUNT" });

      expect((await activate({ token })).body.code).toBe("PASSWORD_REQUIRED");
      expect((await activate({ token, password: "curta" })).body.code).toBe("WEAK_PASSWORD");

      const done = await activate({ token, password: PASSWORD });
      expect(done.status).toBe(200);
      expect(done.body).toEqual({ role: "ADMIN" });

      const user = await t.prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: { include: { role: true } } } });
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(user.name).toBe(email.split("@")[0]);
      expect(user.roles.map((r) => [r.role.key, r.status, r.grantedVia])).toEqual([["ADMIN", "ACTIVE", "ADMIN_BOOTSTRAP"]]);
      expect(await t.prisma.adminBootstrap.findFirstOrThrow()).toMatchObject({ status: "COMPLETED", targetUserId: user.id });

      const login = await api(t).post("/api/auth/login", { email, password: PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.user.permissions).toEqual([...ROLE_PERMISSIONS.ADMIN].sort());
    });
  });

  it("US3-2 --print-link devolve o link e audita; sem a opção, não", async () => {
    const quiet = await run(uniqueEmail("quieto"));
    expect("link" in quiet ? quiet.link : undefined).toBeUndefined();
    expect(await events("admin.bootstrap.link_printed")).toHaveLength(0);

    const email = uniqueEmail("imprime");
    const loud = await run(email, true);
    expect(loud.outcome).toBe("PENDING");
    expect("link" in loud && loud.link).toBe(t.mailer.lastLinkFor(email, "admin-activation"));
    expect(await t.prisma.adminBootstrap.findFirstOrThrow({ where: { status: "PENDING" } })).toMatchObject({
      linkPrinted: true,
    });
    const printed = await events("admin.bootstrap.link_printed");
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatchObject({ actorType: "OPERATOR", requestId: null, metadata: OPERATOR_META });
  });

  it("US3-3 User verificado → ADMIN direto, senha e sessões intactas, sem e-mail", async () => {
    const user = await createUser(t);
    const cookie = await loginAs(t, user);
    const before = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const result = await run(user.email.toUpperCase());
    expect(result).toEqual({ outcome: "GRANTED", userId: user.id });

    const roles = await adminRoles();
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({ userId: user.id, status: "ACTIVE", grantedVia: "ADMIN_BOOTSTRAP" });
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(before.passwordHash);
    expect(await t.prisma.user.count()).toBe(1);
    expect((await api(t, { cookie }).get("/api/me")).body.roles).toContainEqual({ key: "ADMIN", status: "ACTIVE" });
    expect(await t.prisma.adminBootstrap.findFirstOrThrow()).toMatchObject({
      status: "COMPLETED",
      targetUserId: user.id,
      tokenHash: null,
    });
    await t.flushMail();
    expect(t.mailer.outbox).toHaveLength(0);
    expect(await events("role.granted")).toMatchObject([{ actorType: "OPERATOR", metadata: { role: "ADMIN" } }]);
  });

  it("US3-4 User não verificado → só na ativação, com nova senha e sessões revogadas", async () => {
    const user = await createUser(t, { verified: false });
    const cookies = [await loginAs(t, user), await loginAs(t, user)];
    const token = await pending(user.email);
    expect(await adminRoles()).toHaveLength(0);

    expect((await preview(token)).body).toEqual({ email: user.email, mode: "CLAIM_ACCOUNT" });
    expect((await activate({ token, password: PASSWORD })).status).toBe(200);

    const after = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).not.toBeNull();
    expect((await api(t).post("/api/auth/login", { email: user.email, password: PASSWORD })).status).toBe(200);
    for (const cookie of cookies) expect((await api(t, { cookie }).get("/api/me")).status).toBe(401);
    expect(await t.prisma.user.count()).toBe(1);
    expect(await events("account.claimed")).toMatchObject([{ metadata: { via: "ADMIN_BOOTSTRAP", revokedSessions: 2 } }]);
  });

  describe("US3-5 já existe ADMIN ativo", () => {
    it("recusa sem mudar nada e audita", async () => {
      await createUser(t, { roles: ["ADMIN"] });
      const email = uniqueEmail("tarde");
      expect(await run(email)).toEqual({ outcome: "REFUSED" });
      expect(await t.prisma.adminBootstrap.count()).toBe(0);
      expect(await adminRoles()).toHaveLength(1);
      await t.flushMail();
      expect(t.mailer.outbox).toHaveLength(0);
      expect(await events("admin.bootstrap.refused")).toMatchObject([
        { actorType: "OPERATOR", metadata: { reason: "ADMIN_ALREADY_ACTIVE", ...OPERATOR_META } },
      ]);
    });

    it.each([
      ["papel ADMIN suspenso", { roles: [{ key: "ADMIN" as const, status: "SUSPENDED" as const }] }],
      ["papel ADMIN inativo", { roles: [{ key: "ADMIN" as const, status: "INACTIVE" as const }] }],
      ["conta suspensa", { roles: ["ADMIN" as const], status: "SUSPENDED" as const }],
    ])("%s não conta como ADMIN ativo", async (_label, options) => {
      await createUser(t, options);
      expect((await run(uniqueEmail("novo"))).outcome).toBe("PENDING");
    });
  });

  it("US3-6 execuções simultâneas → um único PENDING (SC-004)", async () => {
    const results: BootstrapResult[] = await Promise.all([run(uniqueEmail("a")), run(uniqueEmail("b"))]);
    expect(results.map((r) => r.outcome)).toEqual(["PENDING", "PENDING"]);
    const rows = await t.prisma.adminBootstrap.findMany();
    expect(rows.map((r) => r.status).sort()).toEqual(["CANCELLED", "PENDING"]);
  });

  describe("US3-7 nova execução cancela o pendente", () => {
    it.each([
      ["mesmo e-mail", true],
      ["outro e-mail", false],
    ])("%s: link antigo deixa de funcionar", async (_label, sameEmail) => {
      const first = uniqueEmail("primeiro");
      const oldToken = await pending(first);
      const second = sameEmail ? first : uniqueEmail("segundo");
      t.mailer.clear();

      const result = await run(second);
      expect(result).toMatchObject({ outcome: "PENDING", cancelledPrevious: true });
      const newToken = tokenFor(second)!;
      expect(newToken).not.toBe(oldToken);

      const rows = await t.prisma.adminBootstrap.findMany({ orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => r.status)).toEqual(["CANCELLED", "PENDING"]);
      expect(rows[0]!.cancelledAt).not.toBeNull();

      expect((await preview(oldToken)).body.code).toBe("TOKEN_INVALID");
      expect((await activate({ token: oldToken, password: PASSWORD })).body.code).toBe("TOKEN_INVALID");
      expect(await events("admin.bootstrap.cancelled")).toMatchObject([
        { actorType: "OPERATOR", metadata: { reason: "SUPERSEDED" } },
      ]);
      expect(await events("admin.bootstrap.requested")).toHaveLength(2);
      expect((await activate({ token: newToken, password: PASSWORD })).status).toBe(200);
    });

    it("também cancela um pendente já expirado", async () => {
      await pending(uniqueEmail("expirado"));
      await t.prisma.$executeRaw`UPDATE admin_bootstraps SET expires_at = now() - interval '1 second'`;
      expect((await run(uniqueEmail("novo"))).outcome).toBe("PENDING");
      expect((await t.prisma.adminBootstrap.findMany()).map((r) => r.status).sort()).toEqual(["CANCELLED", "PENDING"]);
    });
  });

  it("US3-9 auditoria com e-mail, data e origem, sem token", async () => {
    const email = uniqueEmail("auditado");
    const token = await pending(email);
    await activate({ token, password: PASSWORD });
    const verified = await createUser(t);
    await t.prisma.$executeRaw`UPDATE user_roles SET status = 'INACTIVE' WHERE role_id = (SELECT id FROM roles WHERE key = 'ADMIN')`;
    await run(verified.email);

    const requested = await events("admin.bootstrap.requested");
    expect(requested).toMatchObject([
      { actorType: "OPERATOR", requestId: null, metadata: { email, mode: "ACTIVATION_LINK", ...OPERATOR_META } },
      { actorType: "OPERATOR", metadata: { email: verified.email, mode: "DIRECT_GRANT" } },
    ]);
    const completed = await events("admin.bootstrap.completed");
    expect(completed.map((e) => (e.metadata as { mode: string }).mode)).toEqual(["CREATE_ACCOUNT", "DIRECT_GRANT"]);
    expect(completed[0]).toMatchObject({ actorType: "ANONYMOUS", targetType: "USER" });
    expect(completed[1]).toMatchObject({ actorType: "OPERATOR" });
    for (const event of requested) expect(event.occurredAt).toBeInstanceOf(Date);

    const all = serialize(await t.prisma.auditEvent.findMany());
    expect(all).not.toContain(token);
    expect(all).not.toContain(hashToken(token));
  });

  it("409: ADMIN ativo no momento da ativação cancela o pendente", async () => {
    const token = await pending(uniqueEmail("atrasado"));
    await createUser(t, { roles: ["ADMIN"] });

    const res = await activate({ token, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("BOOTSTRAP_ALREADY_DONE");
    expect(await t.prisma.adminBootstrap.findFirstOrThrow()).toMatchObject({ status: "CANCELLED" });
    expect(await events("admin.bootstrap.cancelled")).toMatchObject([
      { actorType: "SYSTEM", metadata: { reason: "ADMIN_ALREADY_ACTIVE" } },
    ]);
    expect(await adminRoles()).toHaveLength(1);
    expect((await activate({ token, password: PASSWORD })).body.code).toBe("TOKEN_INVALID");
  });

  describe("US3-10 conta verificada depois da emissão", () => {
    it("exige a sessão dessa conta e não altera a senha", async () => {
      const email = uniqueEmail("depois");
      const token = await pending(email);
      const owner = await createUser(t, { email, verified: true });
      const before = await t.prisma.user.findUniqueOrThrow({ where: { id: owner.id } });

      expect((await preview(token)).body).toEqual({ email, mode: "SIGN_IN_REQUIRED" });
      expect((await activate({ token, password: PASSWORD })).body.code).toBe("SIGN_IN_REQUIRED");

      const other = await loginAs(t, await createUser(t));
      const wrong = await activate({ token }, other);
      expect(wrong.status).toBe(403);
      expect(wrong.body.code).toBe("WRONG_ACCOUNT");
      expect(await adminRoles()).toHaveLength(0);

      const cookie = await loginAs(t, owner);
      const ok = await activate({ token, password: "ignorada-pelo-servidor" }, cookie);
      expect(ok.status).toBe(200);
      expect((await adminRoles()).map((r) => r.userId)).toEqual([owner.id]);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash).toBe(before.passwordHash);

      expect((await activate({ token }, cookie)).status).toBe(200);
      expect((await activate({ token })).body.code).toBe("TOKEN_INVALID");
      expect(await adminRoles()).toHaveLength(1);
    });
  });

  describe("tokens e validação", () => {
    it("expirado ou adulterado → TOKEN_INVALID", async () => {
      const token = await pending(uniqueEmail("x"));
      const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
      expect((await preview(tampered)).body.code).toBe("TOKEN_INVALID");
      await t.prisma.$executeRaw`UPDATE admin_bootstraps SET expires_at = now() - interval '1 second'`;
      expect((await preview(token)).body.code).toBe("TOKEN_INVALID");
      expect((await activate({ token, password: PASSWORD })).body.code).toBe("TOKEN_INVALID");
    });

    it("campo extra → VALIDATION_ERROR", async () => {
      const token = await pending(uniqueEmail("x"));
      const res = await activate({ token, password: PASSWORD, role: "ADMIN" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rate limit: 6ª tentativa com o mesmo token → 429 (FR-022)", async () => {
      const token = "z".repeat(43);
      for (let i = 0; i < 5; i += 1) {
        const res = await activate({ token, password: PASSWORD });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("TOKEN_INVALID");
      }
      const blocked = await activate({ token, password: PASSWORD });
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe("RATE_LIMITED");
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    });
  });

  it("cookie de sessão nunca é emitido pela ativação", async () => {
    const token = await pending(uniqueEmail("sem-cookie"));
    const res = await activate({ token, password: PASSWORD });
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(false);
  });
});

