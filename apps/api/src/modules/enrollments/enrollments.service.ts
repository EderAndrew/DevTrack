import { Injectable } from "@nestjs/common";
import type { EnrollmentListQuery, EnrollmentPage } from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { decodeNameCursor, encodeNameCursor, escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { type EnrollmentRow, toEnrollmentView } from "./enrollment.view";

export const ENROLLMENTS_PAGE_SIZE = 20;

const SELECT_ROW = Prisma.sql`
  SELECT e.id, e.status, e.enrolled_at, e.removed_at, u.id AS user_id, u.name, u.email, sp.ra
  FROM enrollments e
  JOIN student_profiles sp ON sp.user_id = e.student_user_id
  JOIN users u ON u.id = e.student_user_id`;

/**
 * Students of a teacher's class (003 US6, FR-045), read-only since 027: the enrollments are the class's turma's,
 * and the list is scoped to a class of the session's teacher (404 otherwise, D7). Ending an enrollment is the
 * MANAGER's, in the turma (`CohortEnrollmentRemovalService`, 027/US5).
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
  ) {}

  /**
   * Ordered by name (case-insensitive), 20 per page; search by part of the name or by the start
   * of the RA; status filter, ACTIVE by default (FR-045).
   */
  async list(teacherId: string, classId: string, { query, status, cursor }: EnrollmentListQuery): Promise<EnrollmentPage> {
    const { cohortId } = await this.context.findOwnedOrNotFound(teacherId, classId);
    const after = cursor ? decodeNameCursor(cursor) : null;
    const term = query?.trim() ?? "";
    const conditions = [Prisma.sql`e.cohort_id = ${cohortId}::uuid`, Prisma.sql`e.status = ${status ?? "ACTIVE"}::enrollment_status`];
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
}
