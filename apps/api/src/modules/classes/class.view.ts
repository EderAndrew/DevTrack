import type { ClassView } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";

/** Every column the view needs plus the number of ACTIVE enrollments (FR-008), the subject and the plan (004). */
export const CLASS_VIEW_SELECT = {
  id: true,
  name: true,
  code: true,
  academicYear: true,
  period: true,
  description: true,
  status: true,
  startsOn: true,
  endsOn: true,
  subject: { select: { id: true, name: true } },
  plan: { select: { status: true } },
  createdAt: true,
  updatedAt: true,
  _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
} as const satisfies Prisma.SchoolClassSelect;

export type ClassViewRow = Prisma.SchoolClassGetPayload<{ select: typeof CLASS_VIEW_SELECT }>;

/** A `@db.Date` column as the contract's "YYYY-MM-DD". */
const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

/** `ClassView` of the contract; dates as ISO (002 S4). The teacher is implied by the session. */
export function toClassView(row: ClassViewRow): ClassView {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    academicYear: row.academicYear,
    period: row.period,
    description: row.description,
    status: row.status,
    activeStudentCount: row._count.enrollments,
    subject: row.subject,
    startsOn: isoDate(row.startsOn),
    endsOn: isoDate(row.endsOn),
    plannable: row.subject !== null && row.startsOn !== null && row.endsOn !== null && row.status !== "ARCHIVED",
    planStatus: row.plan?.status ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
