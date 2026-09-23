import type { RoleKey } from "@repo/contracts";
import type {
  AccountStatus,
  ClassInvitation,
  Enrollment,
  RoleAssignmentStatus,
  SchoolClass,
} from "../../src/generated/prisma/client";
import { RoleRepository } from "../../src/modules/access-control/role.repository";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { SessionService } from "../../src/modules/auth/session.service";
import { PasswordHasher } from "../../src/modules/identity/password-hasher";
import { ProfileRepository } from "../../src/modules/identity/profile.repository";
import { normalizeRa } from "../../src/modules/identity/ra";
import { generateToken, hashToken } from "../../src/platform/crypto/tokens";
import { searchKey } from "../../src/platform/text/search-key";
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
  /** RA of the student profile (003); requires the STUDENT role. Stored normalized. */
  ra?: string;
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
      if (role.key === "STUDENT") {
        await profiles.ensureStudentProfile(tx, created.id, name);
        if (options.ra !== undefined) {
          await tx.studentProfile.update({ where: { userId: created.id }, data: { ra: normalizeRa(options.ra) } });
        }
      }
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

const DAY_MS = 24 * 60 * 60 * 1000;
let classSequence = 0;

export type ClassOverrides = Partial<
  Pick<SchoolClass, "name" | "code" | "academicYear" | "period" | "description" | "status" | "createdAt">
>;

/** Creates a class of `teacherId` directly in the database (003). */
export async function createClass(t: TestApp, teacherId: string, overrides: ClassOverrides = {}): Promise<SchoolClass> {
  classSequence += 1;
  const name = overrides.name ?? `Turma de Teste ${classSequence}`;
  const code = overrides.code ?? `T-${Date.now().toString(36)}-${classSequence}`;
  return t.prisma.schoolClass.create({
    data: {
      teacherId,
      name,
      code,
      academicYear: overrides.academicYear ?? 2026,
      period: overrides.period ?? null,
      description: overrides.description ?? null,
      status: overrides.status ?? "ACTIVE",
      statusChangedAt: overrides.status && overrides.status !== "ACTIVE" ? new Date() : null,
      searchKey: searchKey(name, code),
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
}

export type ClassInvitationOverrides = Partial<
  Pick<
    ClassInvitation,
    "status" | "expiresAt" | "sendCount" | "lastSentAt" | "invitedById" | "cancelReason" | "createdAt"
  >
>;

/**
 * Creates a class invitation directly in the database with a real token (only its hash is
 * stored) and returns both. Defaults: PENDING, sent now, valid for 7 days, invited by the
 * class's teacher. A CANCELLED invitation gets `cancelReason` TEACHER unless given.
 */
export async function createClassInvitation(
  t: TestApp,
  classId: string,
  email: string,
  overrides: ClassInvitationOverrides = {},
): Promise<{ invitation: ClassInvitation; token: string }> {
  const token = generateToken();
  const now = new Date();
  const lastSentAt = overrides.lastSentAt ?? now;
  const status = overrides.status ?? "PENDING";
  const invitedById =
    overrides.invitedById ?? (await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } })).teacherId;
  const invitation = await t.prisma.classInvitation.create({
    data: {
      classId,
      email: email.trim().toLowerCase(),
      tokenHash: hashToken(token),
      status,
      expiresAt: overrides.expiresAt ?? new Date(lastSentAt.getTime() + 7 * DAY_MS),
      sendCount: overrides.sendCount ?? 1,
      lastSentAt,
      invitedById,
      ...(status === "CANCELLED"
        ? { cancelledAt: now, cancelledById: invitedById, cancelReason: overrides.cancelReason ?? "TEACHER" }
        : {}),
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
  return { invitation, token };
}

/** Creates an ACTIVE enrollment directly in the database; the student needs a StudentProfile (003). */
export async function createEnrollment(t: TestApp, classId: string, studentUserId: string): Promise<Enrollment> {
  return t.prisma.enrollment.create({
    data: { classId, studentUserId, status: "ACTIVE", enrolledAt: new Date() },
  });
}
