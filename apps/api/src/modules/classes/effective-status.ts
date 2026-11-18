import type { ClassStatus } from "../../generated/prisma/client";

const RANK: Readonly<Record<ClassStatus, number>> = { ACTIVE: 0, INACTIVE: 1, ARCHIVED: 2 };

/**
 * 027 FR-023, research Q4: the effective status of a disciplina da turma is the most restrictive of the
 * turma's (`cohorts.status`) and its own (`classes.status`): ARCHIVED > INACTIVE > ACTIVE. Derived on every
 * read, never stored; the SQL twin is `class_effective_status(class_id)`.
 */
export function effectiveStatus(cohortStatus: ClassStatus, ownStatus: ClassStatus): ClassStatus {
  return RANK[cohortStatus] >= RANK[ownStatus] ? cohortStatus : ownStatus;
}
