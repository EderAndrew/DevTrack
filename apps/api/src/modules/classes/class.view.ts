import type { ClassView } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { effectiveStatus } from "./effective-status";

/**
 * Every column the view needs: the disciplina da turma, its turma (027: name, code, year, period and
 * description live in `cohorts`) with the number of ACTIVE enrollments (FR-008), the subject and the plan (004).
 */
export const CLASS_VIEW_SELECT = {
  id: true,
  status: true,
  startsOn: true,
  endsOn: true,
  cohort: {
    select: {
      name: true,
      code: true,
      academicYear: true,
      period: true,
      description: true,
      status: true,
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  },
  subject: { select: { id: true, name: true } },
  plan: { select: { status: true } },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.SchoolClassSelect;

export type ClassViewRow = Prisma.SchoolClassGetPayload<{ select: typeof CLASS_VIEW_SELECT }>;

/** A `@db.Date` column as the contract's "YYYY-MM-DD". */
export const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

/**
 * `ClassView` of the contract; dates as ISO (002 S4). The teacher is implied by the session. Provisional
 * shape until 027 T038: the turma's fields come from the cohort and `status` is the effective status (FR-023).
 */
export function toClassView(row: ClassViewRow): ClassView {
  const status = effectiveStatus(row.cohort.status, row.status);
  return {
    id: row.id,
    name: row.cohort.name,
    code: row.cohort.code,
    academicYear: row.cohort.academicYear,
    period: row.cohort.period,
    description: row.cohort.description,
    status,
    activeStudentCount: row.cohort._count.enrollments,
    subject: row.subject,
    startsOn: isoDate(row.startsOn),
    endsOn: isoDate(row.endsOn),
    plannable: row.subject !== null && row.startsOn !== null && row.endsOn !== null && status !== "ARCHIVED",
    planStatus: row.plan?.status ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
