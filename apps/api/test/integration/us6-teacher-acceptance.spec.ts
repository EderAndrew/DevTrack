import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { createUser, DEFAULT_PASSWORD, loginAs, type TestUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const PASSWORD = "senha-nova-do-professor";
const DISPLAY_NAME = "Prof. Convidada";

describe("US6 — aceite de convite de professor com identidade única (FR-044–FR-049)", () => {
  let t: TestApp;
  let manager: TestUser;
  let managerClient: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
    manager = await createUser(t, { roles: ["MANAGER"], name: "Gestora" });
    managerClient = api(t, { cookie: await loginAs(t, manager) });
  });

  const invite = async (email: string) => {
    const res = await managerClient.post("/api/teacher-invitations", { email, displayName: DISPLAY_NAME });
    expect(res.status).toBe(201);
    await t.flushMail();
    return { invitationId: res.body.id as string, token: t.mailer.lastTokenFor(email, "invitation-teacher")! };
  };
  const accept = (body: object, cookie?: string) => api(t, { cookie }).post("/api/invitations/accept", body);
  const login = (email: string, password: string) => api(t).post("/api/auth/login", { email, password });
  const teacherAssignments = () => t.prisma.userRole.count({ where: { role: { key: "TEACHER" } } });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const sessionCookie = (res: { headers: Record<string, unknown> }) =>
    ([] as string[]).concat((res.headers["set-cookie"] as string[] | undefined) ?? []).find((c) =>
      c.startsWith(`${SESSION_COOKIE_NAME}=`),
    );

  it("US6-1 e-mail novo → User verificado, TEACHER, perfil e convite aceito; sem sessão criada", async () => {
    const email = uniqueEmail("nova");
    const { invitationId, token } = await invite(email);

    const res = await accept({ token, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: "TEACHER", mode: "CREATE_ACCOUNT" });
    expect(sessionCookie(res)).toBeUndefined();

    const user = await t.prisma.user.findUniqueOrThrow({
      where: { email },
      include: { teacherProfile: true, roles: { include: { role: true } } },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.name).toBe(DISPLAY_NAME);
    expect(user.teacherProfile?.displayName).toBe(DISPLAY_NAME);
    expect(user.roles.map((r) => [r.role.key, r.status, r.grantedVia, r.grantedById])).toEqual([
      ["TEACHER", "ACTIVE", "INVITATION", manager.id],
    ]);
    expect(await t.prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).toMatchObject({
      status: "ACCEPTED",
      acceptedByUserId: user.id,
    });
    expect((await login(email, PASSWORD)).status).toBe(200);
  });

  it("US6-2 aluno verificado autenticado → mesmo User com STUDENT e TEACHER, senha inalterada", async () => {
    const student = await createUser(t, { name: "Aluna Antiga" });
    const cookie = await loginAs(t, student);
    const before = await t.prisma.user.findUniqueOrThrow({ where: { id: student.id }, include: { studentProfile: true } });
    const { token } = await invite(student.email);

    const res = await accept({ token }, cookie);
    expect(res.body).toEqual({ role: "TEACHER", mode: "SIGN_IN_REQUIRED" });

    const after = await t.prisma.user.findUniqueOrThrow({
      where: { id: student.id },
      include: { studentProfile: true, teacherProfile: true, roles: { include: { role: true } } },
    });
    expect(after.roles.map((r) => [r.role.key, r.status]).sort()).toEqual([
      ["STUDENT", "ACTIVE"],
      ["TEACHER", "ACTIVE"],
    ]);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.name).toBe("Aluna Antiga");
    expect(after.studentProfile).toEqual(before.studentProfile);
    expect(after.teacherProfile?.displayName).toBe(DISPLAY_NAME);
    expect((await api(t, { cookie }).get("/api/me")).status).toBe(200);
    expect(await t.prisma.user.count({ where: { email: student.email } })).toBe(1);
  });

  it("US6-3 sem sessão ou com outra conta → recusado, nada atribuído, convite continua aceitável", async () => {
    const owner = await createUser(t);
    const intruder = await createUser(t);
    const { invitationId, token } = await invite(owner.email);

    const anonymous = await accept({ token });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe("SIGN_IN_REQUIRED");
    const wrong = await accept({ token }, await loginAs(t, intruder));
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe("WRONG_ACCOUNT");

    expect(await teacherAssignments()).toBe(0);
    expect((await t.prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).status).toBe("PENDING");
    expect((await accept({ token }, await loginAs(t, owner))).status).toBe(200);
  });

  describe("US6-4 conta não verificada", () => {
    it("mesmo User, verificado, sessões revogadas, senha antiga inválida", async () => {
      const owner = await createUser(t, { verified: false });
      const sessions = [await loginAs(t, owner), await loginAs(t, owner)];
      const { token } = await invite(owner.email);

      const res = await accept({ token, password: PASSWORD });
      expect(res.body).toEqual({ role: "TEACHER", mode: "CLAIM_ACCOUNT" });

      const after = await t.prisma.user.findUniqueOrThrow({ where: { email: owner.email }, include: { teacherProfile: true } });
      expect(after.id).toBe(owner.id);
      expect(after.emailVerifiedAt).not.toBeNull();
      expect(after.teacherProfile?.displayName).toBe(DISPLAY_NAME);
      for (const cookie of sessions) expect((await api(t, { cookie }).get("/api/me")).status).toBe(401);
      expect((await login(owner.email, DEFAULT_PASSWORD)).body.code).toBe("INVALID_CREDENTIALS");
      expect((await login(owner.email, PASSWORD)).status).toBe(200);
      expect(await events("account.claimed")).toMatchObject([
        { targetId: owner.id, metadata: { via: "INVITATION", revokedSessions: 2 } },
      ]);
    });

    it("sem senha ou com senha fraca → nenhum efeito", async () => {
      const owner = await createUser(t, { verified: false });
      const cookie = await loginAs(t, owner);
      const { invitationId, token } = await invite(owner.email);

      expect((await accept({ token })).body.code).toBe("PASSWORD_REQUIRED");
      expect((await accept({ token, password: "curta" })).body.code).toBe("WEAK_PASSWORD");

      expect((await t.prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).status).toBe("PENDING");
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerifiedAt).toBeNull();
      expect((await api(t, { cookie }).get("/api/me")).status).toBe(200);
      expect(await teacherAssignments()).toBe(0);
    });
  });

  it("US6-5 replay: idempotente só para a conta aceitante", async () => {
    const owner = await createUser(t);
    const cookie = await loginAs(t, owner);
    const otherCookie = await loginAs(t, await createUser(t));
    const { token } = await invite(owner.email);
    expect((await accept({ token }, cookie)).status).toBe(200);

    const counts = async () => ({
      users: await t.prisma.user.count(),
      teacherProfiles: await t.prisma.teacherProfile.count(),
      roles: await t.prisma.userRole.count(),
      accepted: (await events("invitation.accepted")).length,
    });
    const before = await counts();

    expect((await accept({ token }, cookie)).status).toBe(200);
    expect((await accept({ token })).body.code).toBe("TOKEN_INVALID");
    expect((await accept({ token }, otherCookie)).body.code).toBe("TOKEN_INVALID");
    expect(await counts()).toEqual(before);
    expect(await teacherAssignments()).toBe(1);
  });

  describe("US6-6 concorrência", () => {
    it("5 aceites CREATE_ACCOUNT simultâneos → um User, um perfil, uma atribuição", async () => {
      const email = uniqueEmail("corrida");
      const { token } = await invite(email);
      const results = await Promise.all(Array.from({ length: 5 }, () => accept({ token, password: PASSWORD })));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      for (const r of results.filter((r) => r.status !== 200)) expect(r.body.code).toBe("TOKEN_INVALID");
      expect(await t.prisma.user.count({ where: { email } })).toBe(1);
      expect(await t.prisma.teacherProfile.count()).toBe(1);
      expect(await teacherAssignments()).toBe(1);
      expect(await events("invitation.accepted")).toHaveLength(1);
    });

    it("2 aceites SIGN_IN_REQUIRED simultâneos da mesma conta → uma atribuição", async () => {
      const owner = await createUser(t);
      const cookie = await loginAs(t, owner);
      const { token } = await invite(owner.email);
      const results = await Promise.all([accept({ token }, cookie), accept({ token }, cookie)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(await teacherAssignments()).toBe(1);
      expect(await t.prisma.teacherProfile.count()).toBe(1);
      expect(await events("invitation.accepted")).toHaveLength(1);
    });
  });

  it("US6-7 expirado, revogado, substituído e adulterado → mesmo TOKEN_INVALID genérico", async () => {
    const expired = await invite(uniqueEmail("expirado"));
    await t.prisma.$executeRaw`UPDATE invitations SET expires_at = now() - interval '1 second' WHERE id = ${expired.invitationId}::uuid`;
    const revoked = await invite(uniqueEmail("revogado"));
    await managerClient.post(`/api/teacher-invitations/${revoked.invitationId}/revoke`);
    const replacedEmail = uniqueEmail("substituido");
    const replaced = await invite(replacedEmail);
    await managerClient.post(`/api/teacher-invitations/${replaced.invitationId}/resend`);
    const tampered = `${replaced.token.slice(0, -2)}xx`;

    const bodies = [];
    for (const token of [expired.token, revoked.token, replaced.token, tampered]) {
      const res = await accept({ token, password: PASSWORD });
      expect(res.status).toBe(400);
      bodies.push(res.body);
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(bodies[0]).toMatchObject({ code: "TOKEN_INVALID" });
    expect(JSON.stringify(bodies[0])).not.toMatch(/@|Prof/);
    expect((await t.prisma.invitation.findUniqueOrThrow({ where: { id: expired.invitationId } })).status).toBe("EXPIRED");
    expect(await teacherAssignments()).toBe(0);
  });

  it("US6-8 não é possível indicar outro e-mail ou identidade", async () => {
    const owner = await createUser(t);
    const other = await createUser(t);
    const { token } = await invite(owner.email);
    for (const extra of [{ email: other.email }, { userId: other.id }, { role: "MANAGER" }]) {
      const res = await accept({ token, ...extra }, await loginAs(t, other));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    }
    expect((await accept({ token }, await loginAs(t, other))).body.code).toBe("WRONG_ACCOUNT");
    expect(await teacherAssignments()).toBe(0);
  });

  it("US6-9 senha enviada por conta verificada é ignorada", async () => {
    const owner = await createUser(t);
    const { token } = await invite(owner.email);
    expect((await accept({ token, password: PASSWORD }, await loginAs(t, owner))).status).toBe(200);
    expect((await login(owner.email, PASSWORD)).status).toBe(401);
    expect((await login(owner.email, owner.password)).status).toBe(200);
  });

  it("US6-10 atacante com pré-registro perde a conta para o dono do e-mail", async () => {
    const email = uniqueEmail("alvo");
    const attackerPassword = "senha-escolhida-pelo-atacante";
    expect(
      (await api(t).post("/api/auth/signup", { name: "Atacante", email, password: attackerPassword })).status,
    ).toBe(202);
    await t.flushMail();
    const attackerVerifyToken = t.mailer.lastTokenFor(email, "verify-email")!;
    const attackerLogin = await login(email, attackerPassword);
    const attackerCookie = sessionCookie(attackerLogin)!.split(";")[0]!;
    expect((await api(t, { cookie: attackerCookie }).get("/api/me")).status).toBe(200);

    const { token } = await invite(email);
    expect((await accept({ token, password: PASSWORD })).body).toEqual({ role: "TEACHER", mode: "CLAIM_ACCOUNT" });

    expect((await api(t, { cookie: attackerCookie }).get("/api/me")).status).toBe(401);
    expect((await login(email, attackerPassword)).body.code).toBe("INVALID_CREDENTIALS");
    expect(await events("account.claimed")).toHaveLength(1);
    expect((await api(t).post("/api/auth/verify-email", { token: attackerVerifyToken })).body.code).toBe("TOKEN_INVALID");

    const ownerLogin = await login(email, PASSWORD);
    const me = await api(t, { cookie: sessionCookie(ownerLogin)!.split(";")[0]! }).get("/api/me");
    expect(me.body.name).toBe(DISPLAY_NAME);
    expect(JSON.stringify(me.body)).not.toContain("Atacante");
    const profile = await t.prisma.studentProfile.findFirstOrThrow({ where: { user: { email } } });
    expect(profile.displayName).toBe(DISPLAY_NAME);
  });
});
