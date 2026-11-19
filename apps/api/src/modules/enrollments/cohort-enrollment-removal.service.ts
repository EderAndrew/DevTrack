import { Injectable } from "@nestjs/common";
import type { CohortEnrollmentView } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { invalidStateTransition, notFound } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { type CohortEnrollmentRow, toCohortEnrollmentView } from "./cohort-enrollment.view";

/**
 * The MANAGER ends a student's enrollment in a turma (027/US5, FR-014), with the effects of the 003 removal
 * (FR-044, FR-047) for every disciplina of the turma at once: the row becomes REMOVED with its date, author and
 * `removal_reason = 'MANAGER'`, never deleted; account, roles, profile and other enrollments are untouched, and what
 * the student did stays for the teachers. ACTIVE → REMOVED with a conditional UPDATE, so concurrent removals have one
 * effect and a removed enrollment stays as it is (200, no new audit). An ARCHIVED turma takes no removal (409).
 */
@Injectable()
export class CohortEnrollmentRemovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async remove(auth: AuthContext, cohortId: string, enrollmentId: string, requestId: string | null): Promise<CohortEnrollmentView> {
    return this.prisma.runInTransaction(async (tx) => {
      // FOR SHARE: archiving the turma (FOR UPDATE) waits for this removal; an archived turma takes none.
      const [cohort] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM cohorts WHERE id = ${cohortId}::uuid FOR SHARE`;
      if (!cohort) throw notFound();
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM enrollments WHERE id = ${enrollmentId}::uuid AND cohort_id = ${cohortId}::uuid`;
      if (!row) throw notFound();
      if (cohort.status === "ARCHIVED") throw invalidStateTransition();

      const removed = await tx.$queryRaw<{ student_user_id: string }[]>`
        UPDATE enrollments
        SET status = 'REMOVED', removed_at = now(), removed_by_id = ${auth.userId}::uuid, removal_reason = 'MANAGER', updated_at = now()
        WHERE id = ${enrollmentId}::uuid AND cohort_id = ${cohortId}::uuid AND status = 'ACTIVE'
        RETURNING student_user_id`;
      if (removed[0]) {
        await this.audit.record(tx, {
          type: "enrollment.removed",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "ENROLLMENT",
          targetId: enrollmentId,
          requestId,
          metadata: { cohortId, userId: removed[0].student_user_id, reason: "MANAGER" },
        });
      }
      const [view] = await tx.$queryRaw<CohortEnrollmentRow[]>`
        SELECT e.id, e.status, e.source, e.enrolled_at, e.removed_at, u.id AS user_id, u.name, u.email
        FROM enrollments e
        JOIN users u ON u.id = e.student_user_id
        WHERE e.id = ${enrollmentId}::uuid`;
      return toCohortEnrollmentView(view!);
    });
  }
}
