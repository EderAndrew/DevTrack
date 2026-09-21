import type { AccountStatus, RoleAssignmentStatus } from "../../src/generated/prisma/client";
import type { RoleKey } from "../../src/modules/access-control/permissions";
import { RoleRepository } from "../../src/modules/access-control/role.repository";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { SessionService } from "../../src/modules/auth/session.service";
import { PasswordHasher } from "../../src/modules/identity/password-hasher";
import { ProfileRepository } from "../../src/modules/identity/profile.repository";
import type { TestApp } from "./test-app";

export const DEFAULT_PASSWORD = "cavalo-correto-bateria-grampo";

export interface RoleSpec {
  key: RoleKey;
  status?: RoleAssignmentStatus;
}

export interface CreateUserOptions {
  email?: string;
  name?: string;
  password?: string;
  /** Default true. */
  verified?: boolean;
  status?: AccountStatus;
  /** Default ["STUDENT"]; profiles are created for STUDENT and TEACHER. */
  roles?: (RoleKey | RoleSpec)[];
  createdAt?: Date;
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  password: string;
}

let sequence = 0;
const hashCache = new Map<string, Promise<string>>();

export function uniqueEmail(prefix = "user"): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}@example.test`;
}

/** Creates a user directly in the database (no HTTP, no e-mail). */
export async function createUser(t: TestApp, options: CreateUserOptions = {}): Promise<TestUser> {
  const password = options.password ?? DEFAULT_PASSWORD;
  const hasher = t.get(PasswordHasher);
  if (!hashCache.has(password)) hashCache.set(password, hasher.hash(password));
  const passwordHash = await hashCache.get(password)!;

  const email = (options.email ?? uniqueEmail()).trim().toLowerCase();
  const name = options.name ?? "Pessoa de Teste";
  const roles = (options.roles ?? ["STUDENT"]).map((role) => (typeof role === "string" ? { key: role } : role));
  const roleRepository = t.get(RoleRepository);
  const profiles = t.get(ProfileRepository);

  const user = await t.prisma.runInTransaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        emailVerifiedAt: options.verified === false ? null : new Date(),
        status: options.status ?? "ACTIVE",
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      },
    });
    for (const role of roles) {
      const via = role.key === "STUDENT" ? "SELF_SIGNUP" : role.key === "ADMIN" ? "ADMIN_BOOTSTRAP" : "INVITATION";
      const { assignment } = await roleRepository.grant(tx, created.id, role.key, null, via);
      if (role.status && role.status !== "ACTIVE") {
        await tx.userRole.update({ where: { id: assignment.id }, data: { status: role.status } });
      }
      if (role.key === "STUDENT") await profiles.ensureStudentProfile(tx, created.id, name);
      if (role.key === "TEACHER") await profiles.ensureTeacherProfile(tx, created.id, name);
    }
    return created;
  });

  return { id: user.id, email, name, password };
}

/** Opens a session for `user` without going through login; returns the Cookie header value. */
export async function loginAs(t: TestApp, user: Pick<TestUser, "id">): Promise<string> {
  const sessions = t.get(SessionService);
  const { secret } = await t.prisma.runInTransaction((tx) => sessions.create(tx, user.id));
  return `${SESSION_COOKIE_NAME}=${secret}`;
}
