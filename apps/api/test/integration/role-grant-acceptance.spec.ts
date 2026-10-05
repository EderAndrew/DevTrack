import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../../src/platform/crypto/tokens";
import { AppException } from "../../src/platform/http/errors";
import {
  type AcceptInput,
  RoleGrantAcceptance,
} from "../../src/modules/provisioning/role-grant-acceptance.service";
import { PasswordHasher } from "../../src/modules/identity/password-hasher";
import { createUser, loginAs, uniqueEmail } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { SessionService } from "../../src/modules/auth/session.service";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";

const NEW_PASSWORD = "nova-senha-muito-segura-42";

describe("RoleGrantAcceptance (R15, FR-044–FR-048)", () => {
  let t: TestApp;
  let acceptance: RoleGrantAcceptance;

  beforeAll(async () => {
    t = await createTestApp();
    acceptance = t.get(RoleGrantAcceptance);
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  const accept = (input: Partial<AcceptInput> & Pick<AcceptInput, "email">) =>
    t.prisma.runInTransaction((tx) =>
      acceptance.accept(tx, { roleKey: "TEACHER", displayName: "Prof. Convidada", via: "INVITATION", ...input }),
    );

  const errorCode = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return "ok";
    } catch (error) {
      if (error instanceof AppException) return error.code;
      throw error;
    }
  };

  const teacherAssignments = (userId: string) =>
    t.prisma.userRole.findMany({ where: { userId, role: { key: "TEACHER" } } });

  it("resolveMode reflects the invited e-mail's account", async () => {
    const verified = await createUser(t);
    const unverified = await createUser(t, { verified: false });
    const mode = (email: string) => t.prisma.runInTransaction((tx) => acceptance.resolveMode(tx, email));
    expect(await mode(uniqueEmail())).toBe("CREATE_ACCOUNT");
    expect(await mode(verified.email.toUpperCase())).toBe("SIGN_IN_REQUIRED");
    expect(await mode(unverified.email)).toBe("CLAIM_ACCOUNT");
  });

  describe("CREATE_ACCOUNT (FR-046)", () => {
    it("creates a verified user with the role, profile and audit", async () => {
      const issuer = await createUser(t, { roles: ["MANAGER"] });
      const email = uniqueEmail("nova");
      const result = await accept({ email: ` ${email.toUpperCase()} `, password: NEW_PASSWORD, issuerUserId: issuer.id });

      expect(result).toMatchObject({ mode: "CREATE_ACCOUNT", roleGranted: true, revokedSessions: 0 });
      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
      expect(user.email).toBe(email);
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(await t.get(PasswordHasher).verify(user.passwordHash, NEW_PASSWORD)).toBe(true);
      expect(await teacherAssignments(user.id)).toMatchObject([{ status: "ACTIVE", grantedById: issuer.id, grantedVia: "INVITATION" }]);
      expect(await t.prisma.teacherProfile.findUnique({ where: { userId: user.id } })).toMatchObject({
        displayName: "Prof. Convidada",
      });
      expect(await t.prisma.userRole.count({ where: { userId: user.id } })).toBe(1);

      const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "role.granted" } });
      expect(audit).toMatchObject({ actorType: "ANONYMOUS", targetType: "USER_ROLE", targetId: result.userRoleId });
      expect(audit.metadata).toEqual({ userId: user.id, role: "TEACHER", via: "INVITATION" });
    });

    it("requires a password that meets the policy", async () => {
      expect(await errorCode(accept({ email: uniqueEmail() }))).toBe("PASSWORD_REQUIRED");
      expect(await errorCode(accept({ email: uniqueEmail(), password: "unbelievable" }))).toBe("WEAK_PASSWORD");
      expect(await t.prisma.user.count()).toBe(0);
    });

    it("MANAGER gets no teacher profile", async () => {
      const result = await accept({ email: uniqueEmail(), password: NEW_PASSWORD, roleKey: "MANAGER" });
      expect(await t.prisma.teacherProfile.count({ where: { userId: result.userId } })).toBe(0);
    });
  });

  describe("SIGN_IN_REQUIRED (FR-047)", () => {
    it("without a session → 401 SIGN_IN_REQUIRED, nothing granted", async () => {
      const owner = await createUser(t);
      expect(await errorCode(accept({ email: owner.email, password: NEW_PASSWORD }))).toBe("SIGN_IN_REQUIRED");
      expect(await teacherAssignments(owner.id)).toHaveLength(0);
    });

    it("signed in as another account → 403 WRONG_ACCOUNT, nothing granted", async () => {
      const owner = await createUser(t);
      const other = await createUser(t);
      expect(await errorCode(accept({ email: owner.email, currentUserId: other.id }))).toBe("WRONG_ACCOUNT");
      expect(await teacherAssignments(owner.id)).toHaveLength(0);
      expect(await teacherAssignments(other.id)).toHaveLength(0);
    });

    it("signed in as the owner → adds the role, ignores the password, keeps sessions", async () => {
      const owner = await createUser(t, { name: "Ana Aluna" });
      const cookie = await loginAs(t, owner);
      const before = await t.prisma.user.findUniqueOrThrow({ where: { id: owner.id } });

      const result = await accept({ email: owner.email, currentUserId: owner.id, password: NEW_PASSWORD });

      expect(result).toMatchObject({ mode: "SIGN_IN_REQUIRED", userId: owner.id, roleGranted: true, revokedSessions: 0 });
      const after = await t.prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(await t.prisma.userRole.count({ where: { userId: owner.id } })).toBe(2);
      const secret = cookie.slice(`${SESSION_COOKIE_NAME}=`.length);
      expect(await t.get(SessionService).validate(secret)).not.toBeNull();
      expect(await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "role.granted" } })).toMatchObject({
        actorType: "USER",
        actorUserId: owner.id,
      });
    });

    it("repeating is idempotent: no second assignment, profile or audit", async () => {
      const owner = await createUser(t);
      await accept({ email: owner.email, currentUserId: owner.id });
      const again = await accept({ email: owner.email, currentUserId: owner.id });
      expect(again.roleGranted).toBe(false);
      expect(await teacherAssignments(owner.id)).toHaveLength(1);
      expect(await t.prisma.teacherProfile.count({ where: { userId: owner.id } })).toBe(1);
      expect(await t.prisma.auditEvent.count({ where: { type: "role.granted" } })).toBe(1);
    });
  });

  describe("CLAIM_ACCOUNT (FR-048)", () => {
    it("same identity, new password, verified, all sessions revoked, then role + profile", async () => {
      const squatter = await createUser(t, { verified: false, password: "senha-antiga-do-invasor" });
      await loginAs(t, squatter);
      await loginAs(t, squatter);

      const result = await accept({ email: squatter.email, password: NEW_PASSWORD });

      expect(result).toMatchObject({ mode: "CLAIM_ACCOUNT", userId: squatter.id, roleGranted: true, revokedSessions: 2 });
      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: squatter.id } });
      expect(user.emailVerifiedAt).not.toBeNull();
      const hasher = t.get(PasswordHasher);
      expect(await hasher.verify(user.passwordHash, NEW_PASSWORD)).toBe(true);
      expect(await hasher.verify(user.passwordHash, "senha-antiga-do-invasor")).toBe(false);
      expect(await t.prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
      expect(await t.prisma.session.count({ where: { userId: user.id, revokeReason: "ACCOUNT_CLAIMED" } })).toBe(2);
      expect(await t.prisma.teacherProfile.count({ where: { userId: user.id } })).toBe(1);
      expect(await t.prisma.user.count()).toBe(1);

      const claimed = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "account.claimed" } });
      expect(claimed).toMatchObject({ actorType: "ANONYMOUS", targetType: "USER", targetId: user.id });
      expect(claimed.metadata).toEqual({ via: "INVITATION", revokedSessions: 2 });
    });

    it("invalidates pending tokens and drops the pre-registered name (US6-10)", async () => {
      const squatter = await createUser(t, { verified: false, name: "Nome do Invasor" });
      const token = (purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET", suffix: string) =>
        t.prisma.userToken.create({
          data: { userId: squatter.id, purpose, tokenHash: hashToken(`pendente-${suffix}`), expiresAt: new Date(Date.now() + 3_600_000) },
        });
      // At most one live token per purpose: the used one is created (and consumed) first.
      const used = await token("EMAIL_VERIFICATION", "usado");
      await t.prisma.userToken.update({ where: { id: used.id }, data: { usedAt: new Date() } });
      await token("EMAIL_VERIFICATION", "v");
      await token("PASSWORD_RESET", "r");

      const result = await accept({ email: squatter.email, password: NEW_PASSWORD });

      expect(result.invalidatedTokens).toBe(2);
      expect(await t.prisma.userToken.count({ where: { userId: squatter.id, usedAt: null, invalidatedAt: null } })).toBe(0);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: squatter.id }, include: { studentProfile: true } });
      expect(user.name).toBe("Prof. Convidada");
      expect(user.studentProfile?.displayName).toBe("Prof. Convidada");
    });

    it("other branches never touch tokens or the name", async () => {
      const verified = await createUser(t, { name: "Nome Mantido" });
      await t.prisma.userToken.create({
        data: { userId: verified.id, purpose: "PASSWORD_RESET", tokenHash: hashToken("reset-mantido"), expiresAt: new Date(Date.now() + 3_600_000) },
      });
      const result = await accept({ email: verified.email, currentUserId: verified.id });
      expect(result).toMatchObject({ mode: "SIGN_IN_REQUIRED", invalidatedTokens: 0 });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: verified.id } })).name).toBe("Nome Mantido");
      expect(await t.prisma.userToken.count({ where: { userId: verified.id, invalidatedAt: null } })).toBe(1);
    });

    it("requires a password", async () => {
      const squatter = await createUser(t, { verified: false });
      expect(await errorCode(accept({ email: squatter.email }))).toBe("PASSWORD_REQUIRED");
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: squatter.id } })).emailVerifiedAt).toBeNull();
    });
  });

  it("issuer == acceptor → 403 SELF_INVITE_FORBIDDEN, nothing changes (FR-040a)", async () => {
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const cookie = await loginAs(t, manager);
    expect(await errorCode(accept({ email: manager.email, currentUserId: manager.id, issuerUserId: manager.id }))).toBe(
      "SELF_INVITE_FORBIDDEN",
    );
    expect(await teacherAssignments(manager.id)).toHaveLength(0);
    expect(await t.prisma.auditEvent.count()).toBe(0);
    expect(cookie).toContain(SESSION_COOKIE_NAME);
  });

  describe("concurrency (FR-044)", () => {
    it("two CREATE_ACCOUNT accepts → one User, one UserRole, one profile", async () => {
      const email = uniqueEmail("corrida");
      const results = await Promise.allSettled([
        accept({ email, password: NEW_PASSWORD }),
        accept({ email, password: NEW_PASSWORD }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      // Called without the caller's invitation row lock: the loser either hits ON CONFLICT
      // (TOKEN_INVALID) or, when it starts after the winner's commit, finds the verified account
      // (SIGN_IN_REQUIRED). Both refuse; the identity below is what FR-044 guards.
      expect(["TOKEN_INVALID", "SIGN_IN_REQUIRED"]).toContain((rejected?.reason as AppException).code);

      const users = await t.prisma.user.findMany({ where: { email } });
      expect(users).toHaveLength(1);
      expect(await teacherAssignments(users[0]!.id)).toHaveLength(1);
      expect(await t.prisma.teacherProfile.count({ where: { userId: users[0]!.id } })).toBe(1);
    });

    it("two accepts by the signed-in owner → one UserRole, one profile", async () => {
      const owner = await createUser(t);
      await Promise.all([
        accept({ email: owner.email, currentUserId: owner.id }),
        accept({ email: owner.email, currentUserId: owner.id }),
      ]);
      expect(await teacherAssignments(owner.id)).toHaveLength(1);
      expect(await t.prisma.teacherProfile.count({ where: { userId: owner.id } })).toBe(1);
      expect(await t.prisma.auditEvent.count({ where: { type: "role.granted" } })).toBe(1);
    });

    it("two CLAIM_ACCOUNT accepts → the second sees a verified account and needs sign-in", async () => {
      const squatter = await createUser(t, { verified: false });
      const results = await Promise.allSettled([
        accept({ email: squatter.email, password: NEW_PASSWORD }),
        accept({ email: squatter.email, password: NEW_PASSWORD }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect((rejected.reason as AppException).code).toBe("SIGN_IN_REQUIRED");
      expect(await teacherAssignments(squatter.id)).toHaveLength(1);
      expect(await t.prisma.teacherProfile.count({ where: { userId: squatter.id } })).toBe(1);
    });
  });

  it("stores no password or token in the audit trail", async () => {
    await accept({ email: uniqueEmail(), password: NEW_PASSWORD });
    const trail = JSON.stringify(await t.prisma.auditEvent.findMany(), (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    expect(trail).not.toContain(NEW_PASSWORD);
    expect(trail).not.toContain(hashToken(NEW_PASSWORD));
  });
});
