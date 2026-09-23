import type { EnrollmentStatus, EnrollmentView } from "@repo/contracts";

/** Row of the teacher's student list (joins enrollment, user and student profile); no authentication data. */
export interface EnrollmentRow {
  id: string;
  status: EnrollmentStatus;
  enrolled_at: Date;
  removed_at: Date | null;
  user_id: string;
  name: string;
  email: string;
  ra: string | null;
}

/** `EnrollmentView` of the contract; dates as ISO (002 S4). */
export function toEnrollmentView(row: EnrollmentRow): EnrollmentView {
  return {
    id: row.id,
    student: { userId: row.user_id, name: row.name, email: row.email, ra: row.ra },
    status: row.status,
    enrolledAt: row.enrolled_at.toISOString(),
    removedAt: row.removed_at ? row.removed_at.toISOString() : null,
  };
}
