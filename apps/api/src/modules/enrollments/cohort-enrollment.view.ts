import type { CohortEnrollmentView, EnrollmentSource, EnrollmentStatus } from "@repo/contracts";

/** Row of the MANAGER's student list of a turma: enrollment and account; no authentication data. */
export interface CohortEnrollmentRow {
  id: string;
  status: EnrollmentStatus;
  source: EnrollmentSource;
  enrolled_at: Date;
  removed_at: Date | null;
  user_id: string;
  name: string;
  email: string;
}

/** `CohortEnrollmentView` by allowlist; dates as ISO. */
export function toCohortEnrollmentView(row: CohortEnrollmentRow): CohortEnrollmentView {
  return {
    id: row.id,
    student: { userId: row.user_id, name: row.name, email: row.email },
    status: row.status,
    source: row.source,
    enrolledAt: row.enrolled_at.toISOString(),
    removedAt: row.removed_at ? row.removed_at.toISOString() : null,
  };
}
