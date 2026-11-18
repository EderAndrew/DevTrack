import { Injectable } from "@nestjs/common";
import type { CohortEnrollmentPage, CohortEnrollmentView, EnrollmentListQuery, StudentLookupResponse } from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { decodeNameCursor, encodeNameCursor, escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { alreadyEnrolled, cohortNotActive, notFound, rateLimited, studentNotEligible } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { MailOutbox } from "../../platform/mail/outbox/mail-outbox";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../identity/email";
import { type CohortEnrollmentRow, toCohortEnrollmentView } from "./cohort-enrollment.view";
import { ENROLLMENT_NOTICE_SELECT, EnrollmentNoticeMailSubject } from "./enrollment-notice.mail-subject";

export const COHORT_ENROLLMENTS_PAGE_SIZE = 20;

/** 027 research Q7: lookups and direct inclusions per MANAGER per minute (both disclose whether an e-mail is a student). */
export const STUDENT_LOOKUPS_PER_MINUTE = 30;

const SELECT_ROW = Prisma.sql`
  SELECT e.id, e.status, e.source, e.enrolled_at, e.removed_at, u.id AS user_id, u.name, u.email
  FROM enrollments e
  JOIN users u ON u.id = e.student_user_id`;

/**
 * The students of a turma, the MANAGER's side (027 US2, FR-034, research Q7): the list, the lookup of an existing
 * student by exact e-mail and the direct enrollment. A student is eligible only with an ACTIVE account, a verified
 * e-mail, an active STUDENT role and a student profile; every other case (no account, not a student, unverified,
 * deactivated) answers the same `{ found: false }` / `422 STUDENT_NOT_ELIGIBLE`, so the way is the invitation. The
 * e-mail arrives in a POST body and never reaches a URL, a log or the audit trail. The inclusion never creates or
 * changes an account.
 */
@Injectable()
export class DirectEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: MailOutbox,
    private readonly notice: EnrollmentNoticeMailSubject,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Ordered by name (case-insensitive), 20 per page; search by part of the name or of the e-mail; ACTIVE by default. */
  async list(cohortId: string, { query, status, cursor }: EnrollmentListQuery): Promise<CohortEnrollmentPage> {
    await this.findCohort(this.prisma, cohortId);
    const after = cursor ? decodeNameCursor(cursor) : null;
    const term = query?.trim() ?? "";
    const conditions = [Prisma.sql`e.cohort_id = ${cohortId}::uuid`, Prisma.sql`e.status = ${status ?? "ACTIVE"}::enrollment_status`];
    if (term) {
      const like = `%${escapeLike(term).toLowerCase()}%`;
      conditions.push(Prisma.sql`(lower(u.name) LIKE ${like} OR u.email LIKE ${like})`);
    }
    if (after) conditions.push(Prisma.sql`(lower(u.name), e.id) > (${after.name}, ${after.id}::uuid)`);

    const rows = await this.prisma.$queryRaw<CohortEnrollmentRow[]>`
      ${SELECT_ROW}
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY lower(u.name), e.id
      LIMIT ${COHORT_ENROLLMENTS_PAGE_SIZE + 1}`;
    const page = rows.slice(0, COHORT_ENROLLMENTS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map(toCohortEnrollmentView),
      nextCursor:
        rows.length > COHORT_ENROLLMENTS_PAGE_SIZE && last ? encodeNameCursor({ name: last.name.toLowerCase(), id: last.id }) : null,
    };
  }

  /**
   * FR-034: 404 for an unknown turma, `409 COHORT_NOT_ACTIVE` unless ACTIVE, then the limit (30 per MANAGER per
   * minute, `429` audited in its own transaction), then the answer: of the account, only the id and the name, and
   * whether an ACTIVE enrollment in this turma exists. Audited with `found` only.
   */
  async lookup(auth: AuthContext, cohortId: string, rawEmail: string, requestId: string | null): Promise<StudentLookupResponse> {
    await this.assertActive(this.prisma, cohortId);
    await this.enforceLimit(auth, cohortId, requestId);

    return this.prisma.runInTransaction(async (tx) => {
      const student = await this.eligibleStudent(tx, normalizeEmail(rawEmail));
      await this.audit.record(tx, {
        type: "cohort.student_lookup",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "COHORT",
        targetId: cohortId,
        requestId,
        metadata: { cohortId, found: student !== null },
      });
      if (!student) return { found: false };
      const enrolled = await tx.enrollment.count({ where: { cohortId, studentUserId: student.id, status: "ACTIVE" } });
      return { found: true, studentUserId: student.id, name: student.name, alreadyEnrolled: enrolled > 0 };
    });
  }

  /**
   * FR-034: resolves the e-mail again (never an id from the body) and creates the ACTIVE `DIRECT` enrollment under the
   * turma's lock, with the partial UNIQUE as backstop (`409 ALREADY_ENROLLED`, also for simultaneous requests). A
   * pending invitation of the same e-mail in the turma is cancelled (`ENROLLED_DIRECTLY`) in the same transaction, and
   * the notice goes through the 017 outbox after the commit. Its answer (422 or not) also tells whether the e-mail is
   * an eligible student, so it counts in the lookup's limit.
   */
  async enroll(auth: AuthContext, cohortId: string, rawEmail: string, requestId: string | null): Promise<CohortEnrollmentView> {
    const email = normalizeEmail(rawEmail);
    await this.assertActive(this.prisma, cohortId);
    await this.enforceLimit(auth, cohortId, requestId);
    const { enrollmentId, deliveryId, notice } = await this.prisma.runInTransaction(async (tx) => {
      // FOR SHARE: archiving (FOR UPDATE) waits for this enrollment; a closed turma takes none.
      await this.assertActive(tx, cohortId, true);
      const student = await this.eligibleStudent(tx, email);
      if (!student) throw studentNotEligible();

      const now = new Date();
      // ON CONFLICT DO NOTHING against the partial unique index of active enrollments (FR-015).
      const [created] = await tx.enrollment.createManyAndReturn({
        data: [{ cohortId, studentUserId: student.id, status: "ACTIVE", enrolledAt: now, source: "DIRECT", enrolledById: auth.userId }],
        select: { id: true },
        skipDuplicates: true,
      });
      if (!created) throw alreadyEnrolled();

      await this.audit.record(tx, {
        type: "enrollment.created",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "ENROLLMENT",
        targetId: created.id,
        requestId,
        metadata: { cohortId, userId: student.id, invitationId: null, source: "DIRECT" },
      });
      await this.cancelPendingInvitations(tx, cohortId, email, auth.userId, requestId, now);
      const deliveryId = await this.outbox.schedule(tx, "CLASS_ENROLLMENT_NOTICE", created.id, now);
      const notice = await tx.enrollment.findUniqueOrThrow({ where: { id: created.id }, select: ENROLLMENT_NOTICE_SELECT });
      return { enrollmentId: created.id, deliveryId, notice };
    });

    this.outbox.attemptNow(deliveryId, this.notice.mail(notice));
    const [row] = await this.prisma.$queryRaw<CohortEnrollmentRow[]>`${SELECT_ROW} WHERE e.id = ${enrollmentId}::uuid`;
    return toCohortEnrollmentView(row!);
  }

  /**
   * 30 lookups and inclusions per MANAGER per minute (research Q7); over it, `429` with `Retry-After` and
   * `cohort.student_lookup_rate_limited` in its own transaction.
   */
  private async enforceLimit(auth: AuthContext, cohortId: string, requestId: string | null): Promise<void> {
    const state = await this.rateLimit.hit("cohort_student_lookup", auth.userId, { limit: STUDENT_LOOKUPS_PER_MINUTE, windowSec: 60 });
    if (!state.blocked) return;
    await this.prisma.runInTransaction((tx) =>
      this.audit.record(tx, {
        type: "cohort.student_lookup_rate_limited",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "COHORT",
        targetId: cohortId,
        requestId,
        metadata: { cohortId },
      }),
    );
    throw rateLimited(state.retryAfterSec);
  }

  /** The invitation is no longer needed: the stale one reads EXPIRED (as the token would), the rest is cancelled. */
  private async cancelPendingInvitations(tx: Tx, cohortId: string, email: string, actorId: string, requestId: string | null, now: Date) {
    await tx.classInvitation.updateMany({
      where: { cohortId, email, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    const pending = await tx.classInvitation.findMany({ where: { cohortId, email, status: "PENDING" }, select: { id: true } });
    for (const { id } of pending) {
      await tx.classInvitation.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: now, cancelledById: actorId, cancelReason: "ENROLLED_DIRECTLY" },
      });
      await this.outbox.supersedePending(tx, "CLASS_INVITATION", id);
      await this.audit.record(tx, {
        type: "class_invitation.cancelled",
        actorType: "USER",
        actorUserId: actorId,
        targetType: "CLASS_INVITATION",
        targetId: id,
        requestId,
        metadata: { cohortId, invitationId: id, reason: "ENROLLED_DIRECTLY" },
      });
    }
  }

  /** The account of `email` when it can be enrolled directly (FR-034), else null. */
  private async eligibleStudent(tx: Tx, email: string): Promise<{ id: string; name: string } | null> {
    return tx.user.findFirst({
      where: {
        email,
        status: "ACTIVE",
        emailVerifiedAt: { not: null },
        roles: { some: { status: "ACTIVE", role: { key: "STUDENT" } } },
        studentProfile: { status: "ACTIVE" },
      },
      select: { id: true, name: true },
    });
  }

  private async findCohort(db: Pick<Tx, "$queryRaw">, cohortId: string, lock = false): Promise<{ status: string }> {
    const rows = lock
      ? await db.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM cohorts WHERE id = ${cohortId}::uuid FOR SHARE`
      : await db.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM cohorts WHERE id = ${cohortId}::uuid`;
    if (!rows[0]) throw notFound();
    return rows[0];
  }

  /** 404 for an unknown turma; `409 COHORT_NOT_ACTIVE` unless ACTIVE (027/US2-6). */
  private async assertActive(db: Pick<Tx, "$queryRaw">, cohortId: string, lock = false): Promise<void> {
    if ((await this.findCohort(db, cohortId, lock)).status !== "ACTIVE") throw cohortNotActive();
  }
}
