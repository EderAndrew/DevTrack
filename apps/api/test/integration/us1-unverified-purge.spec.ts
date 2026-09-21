import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UnverifiedAccountsJob } from "../../src/modules/retention/unverified-accounts.job";
import { RoleGrantAcceptance } from "../../src/modules/provisioning/role-grant-acceptance.service";
import { hashToken } from "../../src/platform/crypto/tokens";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** Audit ids are BigInt. */
const serialize = (value: unknown) => JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

const DAY_MS = 24 * 3600 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
const PASSWORD = "senha-forte-do-aluno-2026";

describe("job unverified-accounts (FR-017, contracts/maintenance-jobs.md)", () => {
  let t: TestApp;
  let maintenance: MaintenanceService;

  beforeAll(async () => {
    t = await createTestApp();
    maintenance = t.get(MaintenanceService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const purge = async () => {
    const result = await maintenance.run({ job: "unverified-accounts" });
    expect(result.status).toBe("completed");
    return result.status === "completed" ? result.results[0]!.removed : -1;
  };

  const exists = async (user: Pick<TestUser, "id">) => (await t.prisma.user.count({ where: { id: user.id } })) === 1;

  const staleStudent = (days = 8) => createUser(t, { verified: false, createdAt: daysAgo(days) });

  const addToken = (userId: string, token: string) =>
    t.prisma.userToken.create({
      data: { userId, purpose: "EMAIL_VERIFICATION", tokenHash: hashToken(token), expiresAt: daysAgo(-1) },
    });

  const createInvitation = async (email: string, extra: { acceptedByUserId?: string } = {}) => {
    const issuer = await createUser(t, { roles: ["MANAGER"] });
    const role = await t.prisma.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
    return t.prisma.invitation.create({
      data: {
        email,
        displayName: "Prof. Convidada",
        roleId: role.id,
        invitedById: issuer.id,
        tokenHash: hashToken(`convite-${email}`),
        status: extra.acceptedByUserId ? "ACCEPTED" : "PENDING",
        expiresAt: daysAgo(-7),
        lastSentAt: new Date(),
        ...(extra.acceptedByUserId ? { acceptedByUserId: extra.acceptedByUserId, acceptedAt: new Date() } : {}),
      },
    });
  };

  it("remove conta não verificada só-STUDENT com mais de 7 dias e tudo o que é dela", async () => {
    const user = await staleStudent();
    await loginAs(t, user);
    await addToken(user.id, "token-da-conta-removida");

    expect(await purge()).toBe(1);

    expect(await exists(user)).toBe(false);
    expect(await t.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await t.prisma.userToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await t.prisma.studentProfile.count({ where: { userId: user.id } })).toBe(0);
    expect(await t.prisma.userRole.count({ where: { userId: user.id } })).toBe(0);

    const events = await t.prisma.auditEvent.findMany({ where: { type: "account.unverified_purged" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorType: "SYSTEM",
      actorUserId: null,
      targetType: "USER",
      targetId: user.id,
      requestId: null,
      metadata: {},
    });
    const serialized = serialize(events);
    expect(serialized).not.toContain(user.email);
    expect(serialized).not.toContain(user.name);
  });

  it("preserva contas não elegíveis", async () => {
    const young = await staleStudent(6);
    const verified = await createUser(t, { verified: true, createdAt: daysAgo(30) });
    const withTeacher = await createUser(t, {
      verified: false,
      createdAt: daysAgo(30),
      roles: ["STUDENT", { key: "TEACHER", status: "INACTIVE" }],
    });
    const withAcceptedInvite = await staleStudent(30);
    await createInvitation(withAcceptedInvite.email, { acceptedByUserId: withAcceptedInvite.id });

    expect(await purge()).toBe(0);
    for (const user of [young, verified, withTeacher, withAcceptedInvite]) expect(await exists(user)).toBe(true);
    expect(await t.prisma.auditEvent.count({ where: { type: "account.unverified_purged" } })).toBe(0);
  });

  it("depois da remoção: link antigo inválido e o e-mail fica livre para novo cadastro", async () => {
    const user = await staleStudent();
    await addToken(user.id, "x".repeat(43));

    expect(await purge()).toBe(1);

    const verify = await api(t).post("/api/auth/verify-email", { token: "x".repeat(43) });
    expect(verify.status).toBe(400);
    expect(verify.body.code).toBe("TOKEN_INVALID");

    const signup = await api(t).post("/api/auth/signup", { name: "De Novo", email: user.email, password: PASSWORD });
    expect(signup.status).toBe(202);
    const recreated = await t.prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    expect(recreated.id).not.toBe(user.id);
  });

  it("depois da remoção: convite pendente para o e-mail continua aceitável e cria identidade nova", async () => {
    const user = await staleStudent();
    const invitation = await createInvitation(user.email);

    expect(await purge()).toBe(1);
    expect((await t.prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe("PENDING");

    const acceptance = t.get(RoleGrantAcceptance);
    const result = await t.prisma.runInTransaction((tx) =>
      acceptance.accept(tx, {
        email: user.email,
        roleKey: "TEACHER",
        displayName: "Prof. Convidada",
        password: PASSWORD,
        issuerUserId: invitation.invitedById,
        via: "INVITATION",
      }),
    );
    expect(result.mode).toBe("CREATE_ACCOUNT");
    expect(result.userId).not.toBe(user.id);
  });

  it("remove em lotes e execuções concorrentes não removem em dobro", async () => {
    const users = [await staleStudent(), await staleStudent(), await staleStudent()];
    const job = t.get(UnverifiedAccountsJob);
    const context = { now: new Date(), batchSize: 2 };

    const removed = await Promise.all([job.run(context), job.run(context)]);
    expect(removed[0]! + removed[1]!).toBe(3);
    for (const user of users) expect(await exists(user)).toBe(false);
    expect(await t.prisma.auditEvent.count({ where: { type: "account.unverified_purged" } })).toBe(3);
  });

  it("respeita o relógio do contexto (now)", async () => {
    const user = await createUser(t, { verified: false, createdAt: daysAgo(3) });
    expect((await maintenance.run({ job: "unverified-accounts" })).status).toBe("completed");
    expect(await exists(user)).toBe(true);
    const later = await maintenance.run({ job: "unverified-accounts", now: new Date(Date.now() + 5 * DAY_MS) });
    expect(later).toEqual({ status: "completed", results: [{ job: "unverified-accounts", removed: 1 }] });
    expect(await exists(user)).toBe(false);
  });
});
