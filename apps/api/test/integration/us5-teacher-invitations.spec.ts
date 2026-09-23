import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminBootstrapService } from "../../src/modules/admin-bootstrap/admin-bootstrap.service";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, loginAs, requestVerificationToken, type TestUser, uniqueEmail } from "../helpers/factories";
import { registeredRoutes } from "../helpers/routes";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const PASSWORD = "senha-forte-do-professor";

describe("US5 — MANAGER convida e gerencia professores (FR-040–FR-051)", () => {
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
  const newManager = () => createUser(t, { roles: ["MANAGER"], name: "Gestora" });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const teacherRole = (userId: string) =>
    t.prisma.userRole.findFirst({ where: { userId, role: { key: "TEACHER" } } });

  const invite = async (client: ReturnType<typeof api>, email: string, displayName = "Prof. Convidada") => {
    const res = await client.post("/api/teacher-invitations", { email, displayName });
    expect(res.status).toBe(201);
    await t.flushMail();
    return { invitation: res.body, token: t.mailer.lastTokenFor(email, "invitation-teacher")! };
  };

  describe("US5-1 convite e status INVITED", () => {
    it.each([["MANAGER"], ["ADMIN"]] as const)("%s convida; professor aparece INVITED e vira ACTIVE no aceite", async (role) => {
      const client = await asUser(await createUser(t, { roles: [role] }));
      const email = uniqueEmail("prof");
      const before = Date.now();
      const { invitation, token } = await invite(client, email);

      expect(invitation).toMatchObject({ email, displayName: "Prof. Convidada", role: "TEACHER", status: "PENDING", sendCount: 1 });
      expect(Math.abs(new Date(invitation.expiresAt).getTime() - (before + 7 * 86_400_000))).toBeLessThan(60_000);
      expect(t.mailer.lastLinkFor(email, "invitation-teacher")!.startsWith(`${t.config.webOrigin}/convite?token=`)).toBe(true);

      const list = await client.get("/api/teachers");
      expect(list.status).toBe(200);
      expect(list.body.items).toEqual([
        { userId: null, invitationId: invitation.id, displayName: "Prof. Convidada", email, status: "INVITED" },
      ]);
      expect((await client.get("/api/teachers?status=INVITED")).body.items).toHaveLength(1);
      expect((await client.get("/api/teachers?status=ACTIVE")).body.items).toEqual([]);

      expect((await api(t).post("/api/invitations/accept", { token, password: PASSWORD })).status).toBe(200);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email }, include: { teacherProfile: true } });
      expect(user.teacherProfile?.displayName).toBe("Prof. Convidada");

      const after = await client.get("/api/teachers");
      expect(after.body.items).toEqual([
        { userId: user.id, invitationId: null, displayName: "Prof. Convidada", email, status: "ACTIVE" },
      ]);
    });
  });

  it("US5-2 reenvio invalida o link anterior; US5-3 revogação tira o INVITED da lista", async () => {
    const client = await asUser(await newManager());
    const email = uniqueEmail("prof");
    const { invitation, token } = await invite(client, email);

    const resent = await client.post(`/api/teacher-invitations/${invitation.id}/resend`);
    expect(resent.status).toBe(200);
    expect(resent.body.sendCount).toBe(2);
    await t.flushMail();
    const newToken = t.mailer.lastTokenFor(email, "invitation-teacher")!;
    expect((await api(t).post("/api/invitations/preview", { token })).body.code).toBe("TOKEN_INVALID");
    expect((await api(t).post("/api/invitations/preview", { token: newToken })).status).toBe(200);

    const revoked = await client.post(`/api/teacher-invitations/${invitation.id}/revoke`);
    expect(revoked.body.status).toBe("REVOKED");
    expect((await api(t).post("/api/invitations/preview", { token: newToken })).body.code).toBe("TOKEN_INVALID");
    expect((await client.get("/api/teachers")).body.items).toEqual([]);
    expect((await client.get("/api/teacher-invitations?status=REVOKED")).body.items.map((i: { id: string }) => i.id)).toEqual([
      invitation.id,
    ]);
  });

  it("US5-4 e-mail de aluno responde igual a e-mail sem conta; o aluno aceita com a própria sessão", async () => {
    const client = await asUser(await newManager());
    const student = await createUser(t, { name: "Aluna Existente" });
    const fresh = await client.post("/api/teacher-invitations", { email: uniqueEmail("nova"), displayName: "Nome" });
    const forStudent = await client.post("/api/teacher-invitations", { email: student.email, displayName: "Nome" });

    const strip = (res: typeof fresh) => {
      const { id: _id, email: _email, expiresAt: _exp, lastSentAt: _last, ...rest } = res.body as Record<string, unknown>;
      return { status: res.status, body: rest };
    };
    expect(strip(forStudent)).toEqual(strip(fresh));
    expect(JSON.stringify(forStudent.body)).not.toContain("Aluna Existente");

    await t.flushMail();
    const token = t.mailer.lastTokenFor(student.email, "invitation-teacher")!;
    expect((await api(t).post("/api/invitations/accept", { token })).body.code).toBe("SIGN_IN_REQUIRED");
    const accepted = await api(t, { cookie: await loginAs(t, student) }).post("/api/invitations/accept", { token });
    expect(accepted.body).toEqual({ role: "TEACHER", mode: "SIGN_IN_REQUIRED" });
    const roles = await t.prisma.userRole.findMany({ where: { userId: student.id }, include: { role: true } });
    expect(roles.map((r) => [r.role.key, r.status]).sort()).toEqual([
      ["STUDENT", "ACTIVE"],
      ["TEACHER", "ACTIVE"],
    ]);
  });

  it("US5-5 MANAGER não acessa contas; aluno não é visível como professor", async () => {
    const client = await asUser(await newManager());
    const student = await createUser(t);
    for (const res of [await client.get("/api/users"), await client.get(`/api/users/${student.id}`)]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    const asTeacher = await client.get(`/api/teachers/${student.id}`);
    const missing = await client.get("/api/teachers/00000000-0000-4000-8000-000000000000");
    expect(asTeacher.status).toBe(404);
    expect(asTeacher.body).toEqual(missing.body);
    expect((await client.post(`/api/teachers/${student.id}/deactivate`)).status).toBe(404);
  });

  describe("US5-6/US5-7 ciclo de vida do professor", () => {
    it("desativar preserva STUDENT e perfil; reativar sem nova identidade", async () => {
      const client = await asUser(await newManager());
      const teacher = await createUser(t, { roles: ["STUDENT", "TEACHER"], name: "Prof. Ana" });
      const cookie = await loginAs(t, teacher);
      const users = await t.prisma.user.count();
      const profile = await t.prisma.teacherProfile.findUniqueOrThrow({ where: { userId: teacher.id } });

      const res = await client.post(`/api/teachers/${teacher.id}/deactivate`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ userId: teacher.id, status: "INACTIVE" });
      expect((await api(t, { cookie }).get("/api/me")).status).toBe(401);
      expect((await teacherRole(teacher.id))?.status).toBe("INACTIVE");
      const student = await t.prisma.userRole.findFirstOrThrow({ where: { userId: teacher.id, role: { key: "STUDENT" } } });
      expect(student.status).toBe("ACTIVE");
      expect(await events("role.status_changed")).toMatchObject([{ metadata: { role: "TEACHER", from: "ACTIVE", to: "INACTIVE" } }]);

      expect((await client.post(`/api/teachers/${teacher.id}/suspend`)).body.code).toBe("INVALID_STATE_TRANSITION");
      const back = await client.post(`/api/teachers/${teacher.id}/reactivate`);
      expect(back.body.status).toBe("ACTIVE");
      expect((await client.post(`/api/teachers/${teacher.id}/reactivate`)).body.code).toBe("INVALID_STATE_TRANSITION");

      expect(await t.prisma.user.count()).toBe(users);
      expect(await t.prisma.teacherProfile.count({ where: { userId: teacher.id } })).toBe(1);
      expect((await t.prisma.teacherProfile.findUniqueOrThrow({ where: { userId: teacher.id } })).createdAt).toEqual(
        profile.createdAt,
      );
    });

    it("suspender revoga sessões; reativar de SUSPENDED volta a ACTIVE (SC-007)", async () => {
      const client = await asUser(await newManager());
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const cookie = await loginAs(t, teacher);
      const res = await client.post(`/api/teachers/${teacher.id}/suspend`);
      expect(res.body.status).toBe("SUSPENDED");
      expect((await api(t, { cookie }).get("/api/me")).status).toBe(401);
      expect((await client.post(`/api/teachers/${teacher.id}/reactivate`)).body.status).toBe("ACTIVE");
    });
  });

  it("US5-8 MANAGER não suspende contas, não atribui outros papéis e não existe rota de senha alheia", async () => {
    const client = await asUser(await newManager());
    const other = await createUser(t, { roles: ["MANAGER"] });
    expect((await client.post(`/api/users/${other.id}/suspend`)).status).toBe(403);
    expect((await client.post("/api/manager-invitations", { email: uniqueEmail(), displayName: "X" })).status).toBe(403);
    expect((await client.post(`/api/managers/${other.id}/deactivate`)).status).toBe(403);

    const routes = (await registeredRoutes()).map((r) => r.route);
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((r) => /password|senha/i.test(r) && !/password-reset/.test(r))).toEqual([]);
  });

  describe("US5-9 autoconvite", () => {
    it("MANAGER convidando o próprio e-mail → 403 auditado", async () => {
      const manager = await newManager();
      const res = await (await asUser(manager)).post("/api/teacher-invitations", {
        email: ` ${manager.email.toUpperCase()}`,
        displayName: "Eu",
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("SELF_INVITE_FORBIDDEN");
      expect(await t.prisma.invitation.count()).toBe(0);
      expect(await events("invitation.self_invite_blocked")).toMatchObject([{ actorUserId: manager.id, metadata: { role: "TEACHER" } }]);
    });

    it("aceite pelo próprio emissor → 403, nenhum TEACHER", async () => {
      const manager = await newManager();
      const role = await t.prisma.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
      const token = "m".repeat(43);
      await t.prisma.invitation.create({
        data: {
          email: manager.email,
          displayName: "Eu",
          roleId: role.id,
          invitedById: manager.id,
          tokenHash: hashToken(token),
          status: "PENDING",
          expiresAt: new Date(Date.now() + 86_400_000),
          lastSentAt: new Date(),
        },
      });
      const res = await api(t, { cookie: await loginAs(t, manager) }).post("/api/invitations/accept", { token });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("SELF_INVITE_FORBIDDEN");
      expect(await teacherRole(manager.id)).toBeNull();
    });
  });

  it("US5-10 TeacherView só com dados docentes", async () => {
    const client = await asUser(await newManager());
    const person = await createUser(t, { roles: ["STUDENT", "MANAGER", "TEACHER"], name: "Nome da Conta" });
    await t.prisma.teacherProfile.update({ where: { userId: person.id }, data: { displayName: "Prof. Docente" } });
    const role = await t.prisma.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
    const manager = await t.prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { key: "MANAGER" } } }, NOT: { id: person.id } } });
    await t.prisma.invitation.create({
      data: {
        email: person.email,
        displayName: "Prof. Docente",
        roleId: role.id,
        invitedById: manager.id,
        tokenHash: hashToken("convite-aceito"),
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedByUserId: person.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSentAt: new Date(),
      },
    });

    const res = await client.get(`/api/teachers/${person.id}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["displayName", "email", "invitations", "status", "userId"]);
    expect(res.body).toMatchObject({ userId: person.id, displayName: "Prof. Docente", email: person.email, status: "ACTIVE" });
    expect(res.body.invitations).toHaveLength(1);
    expect(res.body.invitations[0]).toMatchObject({ role: "TEACHER", status: "ACCEPTED" });
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/STUDENT|MANAGER|Nome da Conta/);
  });

  it("US5-11 nenhum token ou segredo em claro no banco", async () => {
    const client = await asUser(await newManager());
    const email = uniqueEmail("segredo");
    await invite(client, email);
    const secrets = [t.mailer.lastTokenFor(email, "invitation-teacher")!];

    const studentEmail = uniqueEmail("aluno");
    await createUser(t, { name: "Aluno", email: studentEmail, password: PASSWORD, verified: false });
    secrets.push(await requestVerificationToken(t, studentEmail));

    const login = await api(t).post("/api/auth/login", { email: studentEmail, password: PASSWORD });
    const setCookie = ([] as string[]).concat(login.headers["set-cookie"] ?? []).find((c) => c.startsWith(SESSION_COOKIE_NAME))!;
    secrets.push(setCookie.slice(SESSION_COOKIE_NAME.length + 1).split(";")[0]!);

    await t.prisma.$executeRaw`UPDATE user_roles SET status = 'INACTIVE' WHERE role_id = (SELECT id FROM roles WHERE key = 'ADMIN')`;
    const adminEmail = uniqueEmail("admin");
    await t.get(AdminBootstrapService).run({ email: adminEmail, printLink: false, operator: { host: "h", user: "u" } });
    secrets.push(t.mailer.lastTokenFor(adminEmail, "admin-activation")!);

    expect(secrets.every((s) => typeof s === "string" && s.length === 43)).toBe(true);
    for (const table of ["invitations", "user_tokens", "sessions", "admin_bootstraps"]) {
      for (const secret of secrets) {
        const rows = await t.prisma.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM ${table} t WHERE row_to_json(t)::text LIKE '%' || $1 || '%'`,
          secret,
        );
        expect(rows[0]!.n).toBe(0);
      }
    }
    // ...while their hashes are there.
    expect(await t.prisma.invitation.count({ where: { tokenHash: hashToken(secrets[0]!) } })).toBe(1);
  });

  it("US5-12 professor ativo → ALREADY_TEACHER; suspenso/inativo → TEACHER_REACTIVATION_REQUIRED", async () => {
    const client = await asUser(await newManager());
    const active = await createUser(t, { roles: ["TEACHER"] });
    const suspended = await createUser(t, { roles: [{ key: "TEACHER", status: "SUSPENDED" }] });
    const inactive = await createUser(t, { roles: [{ key: "TEACHER", status: "INACTIVE" }] });

    const cases: [TestUser, string][] = [
      [active, "ALREADY_TEACHER"],
      [suspended, "TEACHER_REACTIVATION_REQUIRED"],
      [inactive, "TEACHER_REACTIVATION_REQUIRED"],
    ];
    for (const [user, code] of cases) {
      const res = await client.post("/api/teacher-invitations", { email: user.email, displayName: "X" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe(code);
    }
    expect(await t.prisma.invitation.count()).toBe(0);
  });

  it("STUDENT e TEACHER não acessam o cadastro docente; filtros inválidos → 400", async () => {
    for (const role of ["STUDENT", "TEACHER"] as const) {
      const client = await asUser(await createUser(t, { roles: [role] }));
      expect((await client.get("/api/teachers")).status).toBe(403);
      expect((await client.post("/api/teacher-invitations", { email: uniqueEmail(), displayName: "X" })).status).toBe(403);
    }
    const client = await asUser(await newManager());
    expect((await client.get("/api/teachers?status=QUALQUER")).status).toBe(400);
    expect((await client.get("/api/teacher-invitations?status=QUALQUER")).status).toBe(400);
  });
});
