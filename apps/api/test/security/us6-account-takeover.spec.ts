import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createUser, loginAs, requestVerificationToken, type TestUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const OWNER_PASSWORD = "senha-do-dono-do-email";
const ATTACKER_PASSWORD = "senha-escolhida-pelo-atacante";

/**
 * SC-011: whatever the vector, an attacker ends without a valid session, without TEACHER on
 * any account under its control, unable to sign in with its password and without usable tokens.
 */
describe("SC-011 — nenhuma tomada de conta pelo fluxo de convite", () => {
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
    manager = await createUser(t, { roles: ["MANAGER"] });
    managerClient = api(t, { cookie: await loginAs(t, manager) });
  });

  const invite = async (email: string) => {
    const res = await managerClient.post("/api/teacher-invitations", { email, displayName: "Prof. Real" });
    expect(res.status).toBe(201);
    await t.flushMail();
    return t.mailer.lastTokenFor(email, "invitation-teacher")!;
  };
  const accept = (body: object, cookie?: string) => api(t, { cookie }).post("/api/invitations/accept", body);
  const login = (email: string, password: string) => api(t).post("/api/auth/login", { email, password });
  const cookieOf = (res: { headers: Record<string, unknown> }) =>
    ([] as string[])
      .concat((res.headers["set-cookie"] as string[] | undefined) ?? [])
      .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!
      .split(";")[0]!;

  /** The attacker pre-registers the victim's e-mail and keeps a session open. */
  const preRegister = async (email: string) => {
    await createUser(t, { name: "Atacante", email, password: ATTACKER_PASSWORD, verified: false });
    await requestVerificationToken(t, email);
    return cookieOf(await login(email, ATTACKER_PASSWORD));
  };

  const liveTokens = (userId: string) =>
    t.prisma.userToken.count({ where: { userId, usedAt: null, invalidatedAt: null } });
  const teacherOf = (userId: string) =>
    t.prisma.userRole.count({ where: { userId, role: { key: "TEACHER" }, status: "ACTIVE" } });

  it("(a) pré-registro não verificado com sessão aberta", async () => {
    const email = uniqueEmail("vitima");
    const attackerCookie = await preRegister(email);
    const token = await invite(email);

    expect((await accept({ token, password: OWNER_PASSWORD })).status).toBe(200);

    const account = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    expect((await api(t, { cookie: attackerCookie }).get("/api/me")).status).toBe(401);
    expect((await login(email, ATTACKER_PASSWORD)).status).toBe(401);
    expect(await liveTokens(account.id)).toBe(0);
    expect(await t.prisma.session.count({ where: { userId: account.id, revokedAt: null } })).toBe(0);
    expect(await t.prisma.auditEvent.count({ where: { type: "account.claimed", targetId: account.id } })).toBe(1);
    // The account now belongs to whoever controls the e-mail.
    expect((await login(email, OWNER_PASSWORD)).status).toBe(200);
  });

  it("(b) aceite com a sessão de outra conta", async () => {
    const owner = await createUser(t);
    const attacker = await createUser(t, { password: ATTACKER_PASSWORD });
    const token = await invite(owner.email);

    const res = await accept({ token, password: ATTACKER_PASSWORD }, await loginAs(t, attacker));
    expect(res.status).toBe(403);
    expect(await teacherOf(attacker.id)).toBe(0);
    expect(await teacherOf(owner.id)).toBe(0);
    expect((await login(owner.email, ATTACKER_PASSWORD)).status).toBe(401);
    expect(await t.prisma.auditEvent.count({ where: { type: "invitation.acceptance_refused" } })).toBe(1);
  });

  it("(c) replay de link já aceito por terceiro que o interceptou depois", async () => {
    const email = uniqueEmail("dono");
    const token = await invite(email);
    expect((await accept({ token, password: OWNER_PASSWORD })).status).toBe(200);

    const attacker = await createUser(t, { password: ATTACKER_PASSWORD });
    const withSession = await accept({ token, password: ATTACKER_PASSWORD }, await loginAs(t, attacker));
    const anonymous = await accept({ token, password: ATTACKER_PASSWORD });
    for (const res of [withSession, anonymous]) expect(res.body.code).toBe("TOKEN_INVALID");
    expect(await teacherOf(attacker.id)).toBe(0);
    expect((await login(email, ATTACKER_PASSWORD)).status).toBe(401);
    expect((await login(email, OWNER_PASSWORD)).status).toBe(200);
  });

  it("(d) autoconvite do MANAGER e aceite pelo emissor", async () => {
    const self = await managerClient.post("/api/teacher-invitations", { email: manager.email, displayName: "Eu" });
    expect(self.status).toBe(403);

    const role = await t.prisma.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
    const token = "w".repeat(43);
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
    expect((await accept({ token }, await loginAs(t, manager))).body.code).toBe("SELF_INVITE_FORBIDDEN");
    expect(await teacherOf(manager.id)).toBe(0);
  });

  it("(e) reenvio de verificação disparado pelo atacante antes do aceite", async () => {
    const email = uniqueEmail("alvo");
    const attackerCookie = await preRegister(email);
    expect((await api(t).post("/api/auth/verify-email/resend", { email })).status).toBe(202);
    await t.flushMail();
    const pendingVerification = t.mailer.lastTokenFor(email, "verify-email")!;
    const account = await t.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await liveTokens(account.id)).toBe(1);

    const token = await invite(email);
    expect((await accept({ token, password: OWNER_PASSWORD })).status).toBe(200);

    expect(await liveTokens(account.id)).toBe(0);
    expect((await api(t).post("/api/auth/verify-email", { token: pendingVerification })).body.code).toBe("TOKEN_INVALID");
    expect((await api(t, { cookie: attackerCookie }).get("/api/me")).status).toBe(401);
    expect(await t.prisma.session.count({ where: { userId: account.id, revokedAt: null } })).toBe(0);
  });
});
