import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PERMISSIONS } from "../../src/modules/access-control/permissions";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, loginAs, type TestUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const PASSWORD = "senha-forte-do-manager";
const MANAGER_PERMISSIONS = PERMISSIONS.filter((p) => p.startsWith("professores.") || p.startsWith("sessoes.")).sort();

describe("US4 — ADMIN provisiona MANAGER (FR-040–FR-056)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const asUser = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });
  const newAdmin = (name = "Admin Teste") => createUser(t, { roles: ["ADMIN"], name });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const managerRole = (userId: string) =>
    t.prisma.userRole.findFirst({ where: { userId, role: { key: "MANAGER" } } });

  /** ADMIN invites `email` as MANAGER and returns the e-mailed token. */
  const invite = async (admin: TestUser, email: string, displayName = "Gestora Convidada") => {
    const res = await (await asUser(admin)).post("/api/manager-invitations", { email, displayName });
    expect(res.status).toBe(201);
    await t.flushMail();
    return { invitation: res.body, token: t.mailer.lastTokenFor(email, "invitation-manager")! };
  };

  const preview = (token: string, cookie?: string) => api(t, { cookie }).post("/api/invitations/preview", { token });
  const accept = (body: object, cookie?: string) => api(t, { cookie }).post("/api/invitations/accept", body);

  describe("US4-1 convite", () => {
    it("cria convite PENDING, envia o link e audita", async () => {
      const admin = await newAdmin();
      const email = uniqueEmail("gestora");
      const before = Date.now();
      const res = await (await asUser(admin)).post("/api/manager-invitations", {
        email: ` ${email.toUpperCase()} `,
        displayName: "Gestora Convidada",
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        email,
        displayName: "Gestora Convidada",
        role: "MANAGER",
        status: "PENDING",
        expiresAt: expect.any(String),
        sendCount: 1,
        lastSentAt: expect.any(String),
        invitedBy: { id: admin.id, name: "Admin Teste" },
      });
      expect(Math.abs(new Date(res.body.expiresAt).getTime() - (before + 7 * 24 * 3600 * 1000))).toBeLessThan(60_000);

      await t.flushMail();
      const link = t.mailer.lastLinkFor(email, "invitation-manager")!;
      expect(link.startsWith(`${t.config.webOrigin}/convite?token=`)).toBe(true);
      const row = await t.prisma.invitation.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.tokenHash).toBe(hashToken(t.mailer.lastTokenFor(email, "invitation-manager")!));

      expect(await events("invitation.created")).toMatchObject([
        { actorType: "USER", actorUserId: admin.id, targetType: "INVITATION", targetId: row.id, metadata: { role: "MANAGER", email } },
      ]);

      const list = await (await asUser(admin)).get("/api/manager-invitations?status=PENDING");
      expect(list.status).toBe(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([row.id]);
    });

    it("valida o corpo", async () => {
      const client = await asUser(await newAdmin());
      expect((await client.post("/api/manager-invitations", { email: "x", displayName: "A" })).status).toBe(400);
      const extra = await client.post("/api/manager-invitations", { email: uniqueEmail(), displayName: "A", role: "ADMIN" });
      expect(extra.status).toBe(400);
      expect(extra.body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("US4-2 aceite", () => {
    it("CREATE_ACCOUNT concede MANAGER com as permissões do contrato", async () => {
      const admin = await newAdmin();
      const email = uniqueEmail("gestora");
      const { invitation, token } = await invite(admin, email);

      expect((await preview(token)).body).toEqual({
        role: "MANAGER",
        email,
        displayName: "Gestora Convidada",
        mode: "CREATE_ACCOUNT",
      });
      const res = await accept({ token, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ role: "MANAGER", mode: "CREATE_ACCOUNT" });

      const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(user.name).toBe("Gestora Convidada");
      expect(await managerRole(user.id)).toMatchObject({ status: "ACTIVE", grantedVia: "INVITATION", grantedById: admin.id });
      expect(await t.prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).toMatchObject({
        status: "ACCEPTED",
        acceptedByUserId: user.id,
      });
      expect(await events("invitation.accepted")).toMatchObject([
        { actorType: "ANONYMOUS", targetId: invitation.id, metadata: { role: "MANAGER", userId: user.id, mode: "CREATE_ACCOUNT" } },
      ]);

      const login = await api(t).post("/api/auth/login", { email, password: PASSWORD });
      expect(login.body.user.permissions).toEqual(MANAGER_PERMISSIONS);
    });

    it("CLAIM_ACCOUNT revoga sessões antigas e concede MANAGER", async () => {
      const admin = await newAdmin();
      const owner = await createUser(t, { verified: false });
      const oldCookie = await loginAs(t, owner);
      const { token } = await invite(admin, owner.email);

      expect((await preview(token)).body.mode).toBe("CLAIM_ACCOUNT");
      expect((await accept({ token, password: PASSWORD })).body).toEqual({ role: "MANAGER", mode: "CLAIM_ACCOUNT" });
      expect((await api(t, { cookie: oldCookie }).get("/api/me")).status).toBe(401);
      expect(await managerRole(owner.id)).toMatchObject({ status: "ACTIVE" });
    });

    it("SIGN_IN_REQUIRED exige a sessão da própria conta e audita as recusas", async () => {
      const admin = await newAdmin();
      const owner = await createUser(t);
      const before = await t.prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      const { invitation, token } = await invite(admin, owner.email);

      expect((await preview(token)).body.mode).toBe("SIGN_IN_REQUIRED");
      const noSession = await accept({ token });
      expect(noSession.status).toBe(401);
      expect(noSession.body.code).toBe("SIGN_IN_REQUIRED");

      const other = await loginAs(t, await createUser(t));
      const wrong = await accept({ token }, other);
      expect(wrong.status).toBe(403);
      expect(wrong.body.code).toBe("WRONG_ACCOUNT");
      expect(await managerRole(owner.id)).toBeNull();

      const cookie = await loginAs(t, owner);
      const ok = await accept({ token, password: "ignorada-pelo-servidor" }, cookie);
      expect(ok.body).toEqual({ role: "MANAGER", mode: "SIGN_IN_REQUIRED" });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash).toBe(before.passwordHash);
      expect(await events("invitation.accepted")).toMatchObject([{ actorType: "USER", actorUserId: owner.id }]);

      const refused = await events("invitation.acceptance_refused");
      expect(refused.map((e) => [e.targetId, (e.metadata as { reason: string }).reason])).toEqual([
        [invitation.id, "SIGN_IN_REQUIRED"],
        [invitation.id, "WRONG_ACCOUNT"],
      ]);

      // Replay: idempotent for the accepting account, generic refusal otherwise.
      expect((await accept({ token }, cookie)).status).toBe(200);
      expect((await accept({ token })).body.code).toBe("TOKEN_INVALID");
      expect(await events("invitation.accepted")).toHaveLength(1);
    });

    it("aceites concorrentes → um User e uma atribuição", async () => {
      const admin = await newAdmin();
      const email = uniqueEmail("corrida");
      const { token } = await invite(admin, email);
      const results = await Promise.all([accept({ token, password: PASSWORD }), accept({ token, password: PASSWORD })]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await t.prisma.user.count({ where: { email } })).toBe(1);
      expect(await t.prisma.userRole.count({ where: { role: { key: "MANAGER" } } })).toBe(1);
    });
  });

  describe("US4-3 sem capacidade", () => {
    it.each([["MANAGER"], ["TEACHER"], ["STUDENT"]] as const)("%s → 403 nas rotas de administração", async (role) => {
      const target = await createUser(t, { roles: ["MANAGER"] });
      const client = await asUser(await createUser(t, { roles: [role] }));
      const calls = [
        client.post("/api/manager-invitations", { email: uniqueEmail(), displayName: "X" }),
        client.get("/api/managers"),
        client.get("/api/manager-invitations"),
        client.post(`/api/managers/${target.id}/deactivate`),
        client.get("/api/users"),
        client.post(`/api/users/${target.id}/suspend`),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
      expect(await t.prisma.invitation.count()).toBe(0);
    });

    it("sem sessão → 401", async () => {
      expect((await api(t).get("/api/managers")).status).toBe(401);
    });
  });

  describe("US4-4 desativar e reativar MANAGER (SC-007)", () => {
    it("revoga sessões, remove capacidades e preserva histórico", async () => {
      const admin = await newAdmin();
      const manager = await createUser(t, { roles: ["MANAGER"], name: "Gestor" });
      const managerCookie = await loginAs(t, manager);
      // A teacher invitation issued by the manager must survive the deactivation.
      const teacherRole = await t.prisma.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
      await t.prisma.invitation.create({
        data: {
          email: uniqueEmail("prof"),
          displayName: "Prof",
          roleId: teacherRole.id,
          invitedById: manager.id,
          tokenHash: hashToken("convite-do-gestor"),
          status: "PENDING",
          expiresAt: new Date(Date.now() + 86_400_000),
          lastSentAt: new Date(),
        },
      });
      const client = await asUser(admin);

      const list = await client.get("/api/managers");
      expect(list.body.items).toEqual([{ userId: manager.id, name: "Gestor", email: manager.email, status: "ACTIVE" }]);

      const res = await client.post(`/api/managers/${manager.id}/deactivate`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userId: manager.id, name: "Gestor", email: manager.email, status: "INACTIVE" });
      expect((await api(t, { cookie: managerCookie }).get("/api/me")).status).toBe(401);
      const relogin = await api(t).post("/api/auth/login", { email: manager.email, password: manager.password });
      expect(relogin.body.user.permissions.filter((p: string) => p.startsWith("professores."))).toEqual([]);
      expect(await t.prisma.invitation.count({ where: { invitedById: manager.id } })).toBe(1);
      expect(await events("role.status_changed")).toMatchObject([{ metadata: { role: "MANAGER", from: "ACTIVE", to: "INACTIVE" } }]);

      expect((await client.post(`/api/managers/${manager.id}/deactivate`)).body.code).toBe("INVALID_STATE_TRANSITION");

      const back = await client.post(`/api/managers/${manager.id}/reactivate`);
      expect(back.body.status).toBe("ACTIVE");
      const again = await api(t).post("/api/auth/login", { email: manager.email, password: manager.password });
      expect(again.body.user.permissions).toEqual(MANAGER_PERMISSIONS);
      expect(await t.prisma.invitation.count({ where: { role: { key: "MANAGER" } } })).toBe(0);
    });

    it("userId sem papel MANAGER → 404", async () => {
      const client = await asUser(await newAdmin());
      const student = await createUser(t);
      expect((await client.post(`/api/managers/${student.id}/deactivate`)).status).toBe(404);
      expect((await client.post("/api/managers/nao-e-uuid/deactivate")).status).toBe(400);
    });
  });

  describe("US4-5 contas e último ADMIN", () => {
    it("não suspende a própria conta", async () => {
      const admin = await newAdmin();
      const res = await (await asUser(admin)).post(`/api/users/${admin.id}/suspend`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("SELF_ACTION_FORBIDDEN");
    });

    it("suspende e reativa outra conta, revogando as sessões", async () => {
      const a = await newAdmin("Admin A");
      const b = await newAdmin("Admin B");
      const bCookie = await loginAs(t, b);
      const client = await asUser(a);

      const res = await client.post(`/api/users/${b.id}/suspend`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: b.id, status: "SUSPENDED", roles: [{ key: "ADMIN", status: "ACTIVE" }] });
      expect((await api(t, { cookie: bCookie }).get("/api/me")).status).toBe(401);
      expect(await events("account.suspended")).toMatchObject([{ actorUserId: a.id, targetId: b.id }]);
      expect(await events("session.revoked_all")).toMatchObject([{ metadata: { reason: "ACCOUNT_SUSPENDED", count: 1 } }]);
      expect((await client.post(`/api/users/${b.id}/suspend`)).body.code).toBe("INVALID_STATE_TRANSITION");

      const back = await client.post(`/api/users/${b.id}/reactivate`);
      expect(back.status).toBe(200);
      expect(back.body.status).toBe("ACTIVE");
      expect(await events("account.reactivated")).toMatchObject([{ actorUserId: a.id, targetId: b.id }]);
      expect((await client.post(`/api/users/${b.id}/reactivate`)).body.code).toBe("INVALID_STATE_TRANSITION");
      // Sessions are not restored by reactivation.
      expect((await api(t, { cookie: bCookie }).get("/api/me")).status).toBe(401);
    });

    it("dois ADMINs suspendendo um ao outro ao mesmo tempo → um fica (409 LAST_ADMIN_PROTECTED auditado)", async () => {
      const a = await newAdmin("Admin A");
      const b = await newAdmin("Admin B");
      const [aClient, bClient] = [await asUser(a), await asUser(b)];

      const results = await Promise.all([
        aClient.post(`/api/users/${b.id}/suspend`),
        bClient.post(`/api/users/${a.id}/suspend`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe("LAST_ADMIN_PROTECTED");

      const active = await t.prisma.user.count({ where: { id: { in: [a.id, b.id] }, status: "ACTIVE" } });
      expect(active).toBe(1);
      expect(await events("account.last_admin_protected")).toMatchObject([{ metadata: { operation: "SUSPEND" } }]);
    });

    it("ADMIN só suspenso ou de conta suspensa não conta como ativo", async () => {
      const a = await newAdmin("Admin A");
      await createUser(t, { roles: [{ key: "ADMIN", status: "SUSPENDED" }] });
      await createUser(t, { roles: ["ADMIN"], status: "SUSPENDED" });
      const b = await newAdmin("Admin B");
      // A suspends B: A remains, allowed. B cannot be the last one while A is active.
      expect((await (await asUser(a)).post(`/api/users/${b.id}/suspend`)).status).toBe(200);
      const remaining = await t.prisma.userRole.count({
        where: { role: { key: "ADMIN" }, status: "ACTIVE", user: { status: "ACTIVE" } },
      });
      expect(remaining).toBe(1);
    });
  });

  describe("US4-6 autoconvite e duplicidades", () => {
    it("autoconvite → 403 auditado, nenhum convite", async () => {
      const admin = await newAdmin();
      const res = await (await asUser(admin)).post("/api/manager-invitations", {
        email: admin.email.toUpperCase(),
        displayName: "Eu Mesmo",
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("SELF_INVITE_FORBIDDEN");
      expect(await t.prisma.invitation.count()).toBe(0);
      expect(await events("invitation.self_invite_blocked")).toMatchObject([
        { actorType: "USER", actorUserId: admin.id, metadata: { role: "MANAGER" } },
      ]);
    });

    it("ALREADY_MANAGER e INVITATION_ALREADY_PENDING", async () => {
      const admin = await newAdmin();
      const client = await asUser(admin);
      const manager = await createUser(t, { roles: [{ key: "MANAGER", status: "INACTIVE" }] });
      const already = await client.post("/api/manager-invitations", { email: manager.email, displayName: "X" });
      expect(already.status).toBe(409);
      expect(already.body.code).toBe("ALREADY_MANAGER");

      const email = uniqueEmail("dupla");
      const results = await Promise.all([
        client.post("/api/manager-invitations", { email, displayName: "Um" }),
        client.post("/api/manager-invitations", { email, displayName: "Dois" }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe("INVITATION_ALREADY_PENDING");
      expect(await t.prisma.invitation.count({ where: { email } })).toBe(1);
    });

    it("aceite pelo próprio emissor → 403 auditado", async () => {
      const admin = await newAdmin();
      const role = await t.prisma.role.findUniqueOrThrow({ where: { key: "MANAGER" } });
      const token = "s".repeat(43);
      const invitation = await t.prisma.invitation.create({
        data: {
          email: admin.email,
          displayName: "Eu",
          roleId: role.id,
          invitedById: admin.id,
          tokenHash: hashToken(token),
          status: "PENDING",
          expiresAt: new Date(Date.now() + 86_400_000),
          lastSentAt: new Date(),
        },
      });
      const res = await accept({ token }, await loginAs(t, admin));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("SELF_INVITE_FORBIDDEN");
      expect(await managerRole(admin.id)).toBeNull();
      expect(await events("invitation.acceptance_refused")).toMatchObject([
        { targetId: invitation.id, metadata: { reason: "SELF_INVITE" } },
      ]);
    });
  });

  describe("consulta de contas (FR-056)", () => {
    it("lista identidades com filtro e cursor, sem dados acadêmicos", async () => {
      const admin = await newAdmin("Administradora");
      await Promise.all(Array.from({ length: 119 }, (_, i) => createUser(t, { name: `Aluno ${String(i).padStart(3, "0")}` })));
      const client = await asUser(admin);

      const seen = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res = await client.get(`/api/users${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
        expect(res.status).toBe(200);
        for (const item of res.body.items) {
          expect(Object.keys(item).sort()).toEqual(["createdAt", "email", "emailVerified", "id", "name", "roles", "status"]);
          expect(seen.has(item.id)).toBe(false);
          seen.add(item.id);
        }
        cursor = res.body.nextCursor;
        pages += 1;
      } while (cursor);
      expect(seen.size).toBe(120);
      expect(pages).toBe(3);

      const filtered = await client.get("/api/users?query=aluno%20007");
      expect(filtered.body.items.map((i: { name: string }) => i.name)).toEqual(["Aluno 007"]);
      expect((await client.get("/api/users?query=100%25")).body.items).toEqual([]);
      // Wildcards are literal: "100%" finds only a name that contains it, "_" matches nothing.
      await createUser(t, { name: "Promo 100% Aluno" });
      expect((await client.get("/api/users?query=100%25")).body.items.map((i: { name: string }) => i.name)).toEqual([
        "Promo 100% Aluno",
      ]);
      expect((await client.get("/api/users?query=_")).body.items).toEqual([]);

      const one = await client.get(`/api/users/${admin.id}`);
      expect(one.body).toMatchObject({ id: admin.id, name: "Administradora", roles: [{ key: "ADMIN", status: "ACTIVE" }] });
      expect((await client.get("/api/users/00000000-0000-4000-8000-000000000000")).status).toBe(404);
      expect((await client.get("/api/users?cursor=lixo")).status).toBe(400);
    });
  });

  it("rate limit: 6ª tentativa com o mesmo token → 429 (FR-022)", async () => {
    const token = "k".repeat(43);
    for (let i = 0; i < 5; i += 1) {
      const res = await accept({ token, password: PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("TOKEN_INVALID");
    }
    const blocked = await accept({ token, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
  });
});
