import { Controller, Get, Injectable, Param } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RequirePermissions } from "../../src/modules/access-control/decorators";
import { findOwnedOrNotFound, type ResourceContextPolicy } from "../../src/modules/access-control/resource-context";
import { PrismaService } from "../../src/platform/database/prisma.service";
import { Ctx, type RequestContext } from "../../src/platform/http/request-context";
import { createUser, loginAs, type TestUser, uniqueEmail } from "../helpers/factories";
import { registeredRoutes } from "../helpers/routes";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { concretePath, ROLE_PERMISSIONS } from "./authorization-matrix";

/** A context policy written the way Spec 002 policies must be: scoped query, null when out of context. */
@Injectable()
class OwnSessionPolicy implements ResourceContextPolicy<{ id: string }> {
  constructor(private readonly prisma: PrismaService) {}

  findInContext(userId: string, id: string) {
    return this.prisma.session.findFirst({ where: { id, userId }, select: { id: true } });
  }
}

@Controller("fixture-context")
class ContextFixtureController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id")
  @RequirePermissions("sessoes.proprias.listar")
  async get(@Param("id") id: string, @Ctx() ctx: RequestContext) {
    const policy = new OwnSessionPolicy(this.prisma);
    return findOwnedOrNotFound(() => policy.findInContext(ctx.auth!.userId, id));
  }
}

describe("US7 — contexto, papéis e origem (FR-060–FR-063)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [ContextFixtureController] });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const asUser = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });
  const permissionsOf = async (user: TestUser) =>
    ((await (await asUser(user)).get("/api/me")).body as { permissions: string[] }).permissions;

  describe("US7-4 união das permissões dos papéis ativos", () => {
    it("STUDENT + TEACHER → sessões e turmas.*; STUDENT + MANAGER → professores.*", async () => {
      const studentTeacher = await createUser(t, { roles: ["STUDENT", "TEACHER"] });
      expect(await permissionsOf(studentTeacher)).toEqual(
        [...new Set([...ROLE_PERMISSIONS.STUDENT, ...ROLE_PERMISSIONS.TEACHER])].sort(),
      );

      const studentManager = await createUser(t, { roles: ["STUDENT", "MANAGER"] });
      expect((await permissionsOf(studentManager)).filter((p) => p.startsWith("professores."))).toHaveLength(7);
      expect((await (await asUser(studentManager)).get("/api/teachers")).status).toBe(200);
    });

    it.each(["SUSPENDED", "INACTIVE"] as const)("papel %s não contribui", async (status) => {
      const user = await createUser(t, { roles: ["STUDENT", { key: "MANAGER", status }] });
      expect((await permissionsOf(user)).some((p) => p.startsWith("professores."))).toBe(false);
      expect((await (await asUser(user)).get("/api/teachers")).status).toBe(403);
    });
  });

  describe("US7-5 mudança de papel vale na requisição seguinte, sem novo login", () => {
    it("aceitar convite de MANAGER com a sessão aberta libera o mesmo cookie", async () => {
      const admin = await createUser(t, { roles: ["ADMIN"] });
      const student = await createUser(t);
      const cookie = await loginAs(t, student);
      expect((await api(t, { cookie }).get("/api/teachers")).status).toBe(403);

      const invite = await (await asUser(admin)).post("/api/manager-invitations", {
        email: student.email,
        displayName: "Nova Gestora",
      });
      expect(invite.status).toBe(201);
      await t.flushMail();
      const token = t.mailer.lastTokenFor(student.email, "invitation-manager")!;
      expect((await api(t, { cookie }).post("/api/invitations/accept", { token })).status).toBe(200);

      expect((await api(t, { cookie }).get("/api/teachers")).status).toBe(200);

      // Permissions are read on every request: flipping the assignment in the database is enough.
      await t.prisma.userRole.updateMany({
        where: { userId: student.id, role: { key: "MANAGER" } },
        data: { status: "INACTIVE" },
      });
      expect((await api(t, { cookie }).get("/api/teachers")).status).toBe(403);
    });

    it("ADMIN desativando o MANAGER: sessões 401 e, com nova sessão, 403", async () => {
      const admin = await createUser(t, { roles: ["ADMIN"] });
      const manager = await createUser(t, { roles: ["MANAGER"] });
      const cookie = await loginAs(t, manager);
      expect((await api(t, { cookie }).get("/api/teachers")).status).toBe(200);

      expect((await (await asUser(admin)).post(`/api/managers/${manager.id}/deactivate`)).status).toBe(200);
      expect((await api(t, { cookie }).get("/api/teachers")).status).toBe(401);
      expect((await (await asUser(manager)).get("/api/teachers")).status).toBe(403);
    });
  });

  describe("US7-3 contexto reutilizável: 401 → 403 → 404", () => {
    it("recurso alheio e inexistente dão o mesmo 404; sem permissão, 403 antes do contexto", async () => {
      const owner = await createUser(t);
      const ownerCookie = await loginAs(t, owner);
      const ownerSession = await t.prisma.session.findFirstOrThrow({ where: { userId: owner.id } });
      const intruder = await createUser(t);

      expect((await api(t, { cookie: ownerCookie }).get(`/api/fixture-context/${ownerSession.id}`)).status).toBe(200);

      const other = await (await asUser(intruder)).get(`/api/fixture-context/${ownerSession.id}`);
      const missing = await (await asUser(intruder)).get(`/api/fixture-context/${crypto.randomUUID()}`);
      expect(other.status).toBe(404);
      expect(other.body).toEqual(missing.body);

      // No role at all → no permission → 403 before any lookup; no session → 401.
      const roleless = await createUser(t, { roles: [] });
      expect((await (await asUser(roleless)).get(`/api/fixture-context/${ownerSession.id}`)).status).toBe(403);
      expect((await api(t).get(`/api/fixture-context/${ownerSession.id}`)).status).toBe(401);
    });
  });

  describe("CSRF: Origin obrigatório em todo método inseguro", () => {
    it("POST/PATCH/DELETE sem Origin ou de outro site → 403 ORIGIN_NOT_ALLOWED sem efeito", async () => {
      const admin = await createUser(t, { roles: ["ADMIN"] });
      const cookie = await loginAs(t, admin);
      // 017 research N6: the e-mail provider's notices come with no Origin and no session; that one
      // public route authenticates the provider's signature instead (017-notice-auth.spec.ts).
      const PROVIDER_NOTICE = "POST /mail/notices/:provider";
      const all = (await registeredRoutes()).filter((r) => /^(POST|PATCH|DELETE) /.test(r.route));
      expect(all.map((r) => r.route)).toContain(PROVIDER_NOTICE);
      const unsafe = all.filter((r) => r.route !== PROVIDER_NOTICE);
      expect(unsafe.length).toBeGreaterThan(20);

      const snapshot = async () => ({
        users: await t.prisma.user.count(),
        invitations: await t.prisma.invitation.count(),
        revoked: await t.prisma.session.count({ where: { revokedAt: { not: null } } }),
        classes: await t.prisma.schoolClass.count(),
        audit: await t.prisma.auditEvent.count(),
      });
      const before = await snapshot();

      for (const { route } of unsafe) {
        const [method, path] = route.split(" ") as ["POST" | "PATCH" | "DELETE", string];
        for (const origin of [null, "https://evil.example"]) {
          const client = api(t, { cookie, origin });
          const url = concretePath(path);
          const body = { email: uniqueEmail("csrf"), displayName: "X", name: "X", password: "senha-forte-do-teste" };
          const res =
            method === "DELETE"
              ? await client.delete(url)
              : method === "PATCH"
                ? await client.patch(url, body)
                : await client.post(url, body);
          expect({ route, origin, status: res.status, code: res.body?.code }).toEqual({
            route,
            origin,
            status: 403,
            code: "ORIGIN_NOT_ALLOWED",
          });
        }
      }
      expect(await snapshot()).toEqual(before);
    });

    it("GET sem Origin continua aceito", async () => {
      const user = await createUser(t);
      const res = await api(t, { cookie: await loginAs(t, user), origin: null }).get("/api/me");
      expect(res.status).toBe(200);
    });
  });
});
