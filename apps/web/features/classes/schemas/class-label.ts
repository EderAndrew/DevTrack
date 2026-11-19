import type { ClassView } from "@repo/contracts";

/** "<disciplina> · <turma>" (027/FR-030), or only the turma for a class migrated without subject. Plain text. */
export const classLabel = (item: Pick<ClassView, "subject" | "cohort">): string =>
  item.subject ? `${item.subject.name} · ${item.cohort.name}` : item.cohort.name;
