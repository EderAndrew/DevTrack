import type { ClassView } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";

/** Every column the view needs plus the number of ACTIVE enrollments (FR-008). */
export const CLASS_VIEW_SELECT = {
  id: true,
  name: true,
  code: true,
  academicYear: true,
  period: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
} as const satisfies Prisma.SchoolClassSelect;

export type ClassViewRow = Prisma.SchoolClassGetPayload<{ select: typeof CLASS_VIEW_SELECT }>;

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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
