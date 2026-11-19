/**
 * 027 FR-030, research Q2: how a disciplina da turma is named — "<disciplina> · <turma>", or only the turma
 * for a class migrated without subject. Plain text; the web renders it as text.
 */
export function classLabel(subjectName: string | null | undefined, cohortName: string): string {
  return subjectName ? `${subjectName} · ${cohortName}` : cohortName;
}

/** What a Prisma read of a class selects to name it and to derive its effective status. */
export const CLASS_LABEL_SELECT = {
  subject: { select: { name: true } },
  cohort: { select: { name: true, status: true } },
} as const;

/** The label of a class read with `CLASS_LABEL_SELECT`. */
export const labelOf = (row: { subject: { name: string } | null; cohort: { name: string } }): string =>
  classLabel(row.subject?.name, row.cohort.name);
