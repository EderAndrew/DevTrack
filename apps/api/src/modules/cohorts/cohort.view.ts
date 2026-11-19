import type { CohortClassSummary, CohortDetail, CohortView } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { effectiveStatus } from "../classes/effective-status";

/**
 * Every column a `CohortView` needs (027 contracts/http-api.md): the turma, its ACTIVE enrollments and its
 * disciplinas da turma. Nothing pedagogical is selected (FR-007).
 */
export const COHORT_VIEW_SELECT = {
  id: true,
  name: true,
  code: true,
  academicYear: true,
  period: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { enrollments: { where: { status: "ACTIVE" } }, classes: true } },
} as const satisfies Prisma.CohortSelect;

/** The detail adds who teaches what: subject name, teacher name and the class's own status (for the effective one). */
export const COHORT_DETAIL_SELECT = {
  ...COHORT_VIEW_SELECT,
  classes: {
    select: { id: true, status: true, subject: { select: { name: true } }, teacher: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} as const satisfies Prisma.CohortSelect;

export type CohortViewRow = Prisma.CohortGetPayload<{ select: typeof COHORT_VIEW_SELECT }>;
export type CohortDetailRow = Prisma.CohortGetPayload<{ select: typeof COHORT_DETAIL_SELECT }>;

/** `CohortView` by allowlist; dates as ISO. */
export function toCohortView(row: CohortViewRow): CohortView {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    academicYear: row.academicYear,
    period: row.period,
    description: row.description,
    status: row.status,
    activeEnrollmentCount: row._count.enrollments,
    classCount: row._count.classes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** `CohortDetail`: the view plus each disciplina da turma as subject, teacher and effective status (FR-007, FR-023). */
export function toCohortDetail(row: CohortDetailRow): CohortDetail {
  const classes: CohortClassSummary[] = row.classes.map((item) => ({
    id: item.id,
    subjectName: item.subject?.name ?? null,
    teacherName: item.teacher.name,
    effectiveStatus: effectiveStatus(row.status, item.status),
  }));
  return { ...toCohortView(row), classes };
}
