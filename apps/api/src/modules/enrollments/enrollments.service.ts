import { Injectable } from "@nestjs/common";
import type { EnrollmentListQuery, EnrollmentPage, EnrollmentView } from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { invalidStateTransition, notFound, validationError } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { type EnrollmentRow, toEnrollmentView } from "./enrollment.view";

export const ENROLLMENTS_PAGE_SIZE = 20;

/** Position of the last item of a page ordered by `lower(users.name), enrollments.id`. */
interface NameCursor {
  name: string;
  id: string;
}

const encodeNameCursor = (cursor: NameCursor) =>
  Buffer.from(JSON.stringify({ n: cursor.name, i: cursor.id })).toString("base64url");

/** Throws `400 VALIDATION_ERROR` for anything `encodeNameCursor` did not produce. */
function decodeNameCursor(cursor: string): NameCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { n?: unknown; i?: unknown };
    if (typeof parsed.n !== "string" || typeof parsed.i !== "string" || !/^[0-9a-f-]{36}$/i.test(parsed.i)) {
      throw new Error("bad cursor");
    }
    return { name: parsed.n, id: parsed.i };
  } catch {
    throw validationError();
  }
}

const SELECT_ROW = Prisma.sql`
  SELECT e.id, e.status, e.enrolled_at, e.removed_at, u.id AS user_id, u.name, u.email, sp.ra
  FROM enrollments e
  JOIN student_profiles sp ON sp.user_id = e.student_user_id
  JOIN users u ON u.id = e.student_user_id`;

/**
 * Students of a teacher's class (003 US6, FR-044, FR-045). Every lookup is scoped to a class of
 * the session's teacher (404 otherwise, D7). Removing keeps the history: the enrollment becomes
 * REMOVED with its date and author; account, roles, profile and other enrollments are untouched.
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ordered by name (case-insensitive), 20 per page; search by part of the name or by the start
   * of the RA; status filter, ACTIVE by default (FR-045).
   */
  async list(teacherId: string, classId: string, { query, status, cursor }: EnrollmentListQuery): Promise<EnrollmentPage> {
    await this.context.findOwnedOrNotFound(teacherId, classId);
    const after = cursor ? decodeNameCursor(cursor) : null;
    const term = query?.trim() ?? "";
    const conditions = [Prisma.sql`e.class_id = ${classId}::uuid`, Prisma.sql`e.status = ${status ?? "ACTIVE"}::enrollment_status`];
    if (term) {
      const escaped = escapeLike(term);
      conditions.push(
        Prisma.sql`(lower(u.name) LIKE ${`%${escaped.toLowerCase()}%`} OR sp.ra LIKE ${`${escaped.toUpperCase()}%`})`,
      );
    }
    if (after) conditions.push(Prisma.sql`(lower(u.name), e.id) > (${after.name}, ${after.id}::uuid)`);

    const rows = await this.prisma.$queryRaw<EnrollmentRow[]>`
      ${SELECT_ROW}
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY lower(u.name), e.id
      LIMIT ${ENROLLMENTS_PAGE_SIZE + 1}`;
    const page = rows.slice(0, ENROLLMENTS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map(toEnrollmentView),
      nextCursor: rows.length > ENROLLMENTS_PAGE_SIZE && last ? encodeNameCursor({ name: last.name.toLowerCase(), id: last.id }) : null,
    };
  }

  /**
   * ACTIVE → REMOVED with a conditional UPDATE, so concurrent removals have one effect and a
   * removed enrollment stays as it is (200, no new audit). 409 in an archived class.
   */
  async remove(auth: AuthContext, classId: string, enrollmentId: string, requestId: string | null): Promise<EnrollmentView> {
    const teacherId = auth.userId;
    return this.prisma.runInTransaction(async (tx) => {
      await this.lockClass(tx, teacherId, classId);
      const removed = await tx.$queryRaw<{ student_user_id: string }[]>`
        UPDATE enrollments
        SET status = 'REMOVED', removed_at = now(), removed_by_id = ${teacherId}::uuid, updated_at = now()
        WHERE id = ${enrollmentId}::uuid AND class_id = ${classId}::uuid AND status = 'ACTIVE'
        RETURNING student_user_id`;
      if (removed[0]) {
        await this.audit.record(tx, {
          type: "enrollment.removed",
          actorType: "USER",
          actorUserId: teacherId,
          targetType: "ENROLLMENT",
          targetId: enrollmentId,
          requestId,
          metadata: { classId, userId: removed[0].student_user_id },
        });
      }
      const rows = await tx.$queryRaw<EnrollmentRow[]>`
        ${SELECT_ROW}
        WHERE e.id = ${enrollmentId}::uuid AND e.class_id = ${classId}::uuid`;
      if (!rows[0]) throw notFound();
      return toEnrollmentView(rows[0]);
    });
  }

  /** The teacher's class, locked against a concurrent archive; an archived class takes no removal. */
  private async lockClass(tx: Tx, teacherId: string, classId: string): Promise<void> {
    const rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM classes WHERE id = ${classId}::uuid AND teacher_id = ${teacherId}::uuid FOR SHARE`;
    if (!rows[0]) throw notFound();
    if (rows[0].status === "ARCHIVED") throw invalidStateTransition();
  }
}
