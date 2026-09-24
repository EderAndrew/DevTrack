import type { RoleKey } from "@repo/contracts";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type {
  AccountStatus,
  ClassInvitation,
  ClassMeeting,
  ClassPlan,
  ClassPlanStatus,
  Enrollment,
  Prisma,
  RoleAssignmentStatus,
  SchoolClass,
  Subject,
  SubjectStatus,
  SyllabusDocument,
  SyllabusFailureCategory,
  SyllabusMediaType,
  SyllabusProcessingStatus,
  SyllabusRevision,
  SyllabusRevisionSource,
  Topic,
  TopicStatus,
} from "../../src/generated/prisma/client";
import { RoleRepository } from "../../src/modules/access-control/role.repository";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { SessionService } from "../../src/modules/auth/session.service";
import { PasswordHasher } from "../../src/modules/identity/password-hasher";
import { ProfileRepository } from "../../src/modules/identity/profile.repository";
import { normalizeRa } from "../../src/modules/identity/ra";
import { generateToken, hashToken } from "../../src/platform/crypto/tokens";
import { FileStorage } from "../../src/platform/storage/file-storage";
import { searchKey } from "../../src/platform/text/search-key";
import { API_ROOT } from "./env";
import { api, type TestApp } from "./test-app";

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
> & {
  /** 004 offering: a subject of the same teacher and the period, as "YYYY-MM-DD" (both or neither). */
  subjectId?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
};

/** A "YYYY-MM-DD" calendar date as the `Date` Prisma writes to a `@db.Date` column. */
export const dbDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

/** Creates a class of `teacherId` directly in the database (003; offering fields since 004). */
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
      subjectId: overrides.subjectId ?? null,
      startsOn: overrides.startsOn ? dbDate(overrides.startsOn) : null,
      endsOn: overrides.endsOn ? dbDate(overrides.endsOn) : null,
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

/**
 * Verification link of an unverified account through the public resend (FR-015): what public
 * signup used to hand out, now that accounts come from invitations only (003 FR-048).
 */
export async function requestVerificationToken(t: TestApp, email: string): Promise<string> {
  const res = await api(t).post("/api/auth/verify-email/resend", { email });
  if (res.status !== 202) throw new Error(`resend answered ${res.status}`);
  await t.flushMail();
  const token = t.mailer.lastTokenFor(email, "verify-email");
  if (!token) throw new Error(`no verification e-mail for ${email}`);
  return token;
}

// ── 004: subjects, syllabus documents and revisions, calendar, plan and topics ─────────────

let subjectSequence = 0;

export type SubjectOverrides = Partial<{ name: string; description: string | null; status: SubjectStatus }>;

/** Creates a subject of `teacherId` directly in the database (004). */
export async function createSubject(t: TestApp, teacherId: string, overrides: SubjectOverrides = {}): Promise<Subject> {
  subjectSequence += 1;
  const name = overrides.name ?? `Disciplina de Teste ${subjectSequence}`;
  return t.prisma.subject.create({
    data: {
      teacherId,
      name,
      description: overrides.description ?? null,
      status: overrides.status ?? "ACTIVE",
      searchKey: searchKey(name),
    },
  });
}

/** Sample files of `test/fixtures/syllabus` (see its README). */
export const SYLLABUS_FIXTURES = resolve(API_ROOT, "test/fixtures/syllabus");

export function syllabusFixture(name: string): Buffer {
  return readFileSync(resolve(SYLLABUS_FIXTURES, name));
}

/** The `SyllabusExtraction` of the POO sample (poo.pdf / poo.docx). */
export function pooExtraction(): Prisma.InputJsonObject {
  return JSON.parse(syllabusFixture("poo.expected.json").toString("utf8")) as Prisma.InputJsonObject;
}

const MEDIA_TYPES: Record<string, SyllabusMediaType> = { ".pdf": "PDF", ".docx": "DOCX", ".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG" };

export interface SyllabusDocumentOptions {
  /** File of `test/fixtures/syllabus`; default `poo.pdf`. */
  fixture?: string;
  /** Replaces the fixture's bytes (the same bytes twice in one subject are a duplicate, FR-011). */
  bytes?: Buffer;
  /** Default UPLOADED. PROCESSED gets `extraction` (default: the POO sample) and FAILED a category. */
  status?: SyllabusProcessingStatus;
  /** For PROCESSED: `null` → `NO_TEXT`. */
  extraction?: Prisma.InputJsonObject | null;
  failureCategory?: SyllabusFailureCategory;
  /** Default: the subject's teacher. */
  uploadedById?: string;
}

/**
 * Creates the next version of a syllabus document of `subjectId`, with its original file really
 * written to `stored_files` (004).
 */
export async function createSyllabusDocument(
  t: TestApp,
  subjectId: string,
  options: SyllabusDocumentOptions = {},
): Promise<SyllabusDocument> {
  const fixture = options.fixture ?? "poo.pdf";
  const bytes = options.bytes ?? syllabusFixture(fixture);
  const status = options.status ?? "UPLOADED";
  const subject = await t.prisma.subject.findUniqueOrThrow({ where: { id: subjectId } });
  const storage = t.get(FileStorage);
  const extraction = options.extraction === undefined ? pooExtraction() : options.extraction;

  return t.prisma.runInTransaction(async (tx) => {
    const last = await tx.syllabusDocument.aggregate({ where: { subjectId }, _max: { version: true } });
    const file = await storage.put(tx, bytes);
    const now = new Date();
    return tx.syllabusDocument.create({
      data: {
        subjectId,
        version: (last._max.version ?? 0) + 1,
        fileId: file.key,
        originalFilename: fixture,
        mediaType: MEDIA_TYPES[extname(fixture).toLowerCase()] ?? "PDF",
        sizeBytes: file.sizeBytes,
        sha256: new Uint8Array(file.sha256),
        pageCount: fixture.endsWith(".pdf") ? 1 : null,
        processingStatus: status,
        attempts: status === "UPLOADED" ? 0 : 1,
        uploadedById: options.uploadedById ?? subject.teacherId,
        ...(status === "PROCESSED"
          ? {
              extractionResult: extraction === null ? "NO_TEXT" : "TEXT",
              extraction: extraction ?? undefined,
              extractorVersion: 1,
              processedAt: now,
            }
          : {}),
        ...(status === "FAILED" ? { failureCategory: options.failureCategory ?? "UNREADABLE" } : {}),
        ...(status === "PROCESSING" ? { leaseExpiresAt: new Date(now.getTime() + 3 * 60 * 1000) } : {}),
      },
    });
  });
}

export interface ConfirmedRevision {
  revision: SyllabusRevision;
  /** In order, with the ids of their items in order. */
  groups: { id: string; itemIds: string[] }[];
  /** Every item id, group after group. */
  itemIds: string[];
}

/**
 * Creates a CONFIRMED revision of `documentId` with `groups` (004). Groups and items are written
 * while it is still a DRAFT, then it is confirmed, as the immutability triggers require.
 */
export async function createConfirmedRevision(
  t: TestApp,
  documentId: string,
  groups: { title?: string | null; items: string[] }[],
  options: { source?: Exclude<SyllabusRevisionSource, "REVISION">; title?: string | null } = {},
): Promise<ConfirmedRevision> {
  const document = await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: documentId } });
  return t.prisma.runInTransaction(async (tx) => {
    const last = await tx.syllabusRevision.aggregate({ where: { documentId }, _max: { number: true } });
    const draft = await tx.syllabusRevision.create({
      data: {
        documentId,
        number: (last._max.number ?? 0) + 1,
        status: "DRAFT",
        source: options.source ?? "MANUAL",
        title: options.title ?? null,
      },
    });
    const created: ConfirmedRevision["groups"] = [];
    for (const [groupIndex, group] of groups.entries()) {
      const row = await tx.syllabusGroup.create({
        data: { revisionId: draft.id, position: groupIndex + 1, title: group.title ?? null },
      });
      const itemIds: string[] = [];
      for (const [itemIndex, text] of group.items.entries()) {
        const item = await tx.syllabusItem.create({
          data: { revisionId: draft.id, groupId: row.id, position: itemIndex + 1, text },
        });
        itemIds.push(item.id);
      }
      created.push({ id: row.id, itemIds });
    }
    const revision = await tx.syllabusRevision.update({
      where: { id: draft.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: document.uploadedById },
    });
    return { revision, groups: created, itemIds: created.flatMap((group) => group.itemIds) };
  });
}

/** Creates PLANNED meetings of `classId` on `dates` ("YYYY-MM-DD"), returned in date order (004). */
export async function createMeetings(t: TestApp, classId: string, dates: string[]): Promise<ClassMeeting[]> {
  await t.prisma.classMeeting.createMany({ data: dates.map((date) => ({ classId, meetingDate: dbDate(date) })) });
  return t.prisma.classMeeting.findMany({ where: { classId }, orderBy: { meetingDate: "asc" } });
}

/** Creates the plan of `classId` using the confirmed revision `revisionId` (004). */
export async function createPlan(
  t: TestApp,
  classId: string,
  revisionId: string,
  overrides: Partial<{ status: ClassPlanStatus; revision: number }> = {},
): Promise<ClassPlan> {
  const status = overrides.status ?? "DRAFT";
  return t.prisma.classPlan.create({
    data: {
      classId,
      syllabusRevisionId: revisionId,
      status,
      revision: overrides.revision ?? 1,
      statusChangedAt: status === "DRAFT" ? null : new Date(),
    },
  });
}

export interface TopicOptions {
  title?: string;
  description?: string | null;
  meetingId?: string | null;
  /** Items of the plan's revision. */
  itemIds?: string[];
  /**
   * Default: DRAFT in a DRAFT plan, ACTIVE otherwise. ARCHIVED keeps ACTIVE as the previous status;
   * COMPLETED needs `meetingId` and takes that meeting's date as `completedOn`.
   */
  status?: TopicStatus;
  /** Default: after the last topic of the plan. */
  position?: number;
}

/** Creates a MANUAL topic of `planId` directly in the database, with its item links (004). */
export async function createTopic(t: TestApp, planId: string, options: TopicOptions = {}): Promise<Topic> {
  const plan = await t.prisma.classPlan.findUniqueOrThrow({ where: { id: planId }, include: { schoolClass: true } });
  const teacherId = plan.schoolClass.teacherId;
  const status = options.status ?? (plan.status === "DRAFT" ? "DRAFT" : "ACTIVE");
  const last = await t.prisma.topic.aggregate({ where: { planId }, _max: { position: true } });
  const completedOn =
    status === "COMPLETED"
      ? (await t.prisma.classMeeting.findUniqueOrThrow({ where: { id: options.meetingId! } })).meetingDate
      : null;
  return t.prisma.topic.create({
    data: {
      planId,
      meetingId: options.meetingId ?? null,
      title: options.title ?? `Tópico ${(last._max.position ?? 0) + 1}`,
      description: options.description ?? null,
      position: options.position ?? (last._max.position ?? 0) + 1,
      origin: "MANUAL",
      status,
      ...(status === "ARCHIVED" ? { statusBeforeArchive: "ACTIVE", archivedAt: new Date() } : {}),
      completedOn,
      createdById: teacherId,
      updatedById: teacherId,
      items: { create: (options.itemIds ?? []).map((itemId) => ({ itemId })) },
    },
  });
}
