import type { MyCohort, MyCohortClass, MyCohortList } from "@repo/contracts";
import { MY_ACTIVITIES_PATH } from "@/lib/navigation";

/**
 * One disciplina da turma of "Minhas turmas" (027/US8) with its turma's fields: what the 026 "Matéria" card and the
 * pages that pick a subject read. `status` is the effective one (027/FR-023).
 */
export interface MySubjectClass {
  id: string;
  /** The turma's name. */
  name: string;
  code: string;
  academicYear: number;
  period: string | null;
  teacherName: string;
  subjectName: string | null;
  status: MyCohortClass["effectiveStatus"];
}

/** Every disciplina da turma, in the order of the API (most recent ano letivo, then the most recent enrollment). */
export const mySubjectClasses = (list: MyCohortList | undefined): MySubjectClass[] =>
  (list?.years ?? []).flatMap(({ academicYear, cohorts }) =>
    cohorts.flatMap((cohort) =>
      cohort.classes.map((item) => ({
        id: item.classId,
        name: cohort.name,
        code: cohort.code,
        academicYear,
        period: cohort.period,
        teacherName: item.teacherName,
        subjectName: item.subjectName,
        status: item.effectiveStatus,
      })),
    ),
  );

export const NO_CLASSES = "Você ainda não participa de nenhuma turma.";
export const NO_SUBJECTS_YET = "Ainda não há disciplinas nesta turma.";

/** The badge of a turma or a disciplina that is no longer ACTIVE (read-only, 027/FR-004); none when ACTIVE. */
export const STATUS_BADGE: Readonly<Record<MyCohort["status"], string | null>> = {
  ACTIVE: null,
  INACTIVE: "Encerrada",
  ARCHIVED: "Arquivada",
};

/** "<disciplina> · <turma>" (027/FR-030), or the turma alone for a class migrated without a subject. Plain text. */
export const mySubjectLabel = (subjectName: string | null, cohortName: string) =>
  subjectName ? `${subjectName} · ${cohortName}` : cohortName;

/** "Minhas atividades" of one subject (026, `?materia=<classId>`). */
export const subjectActivitiesHref = (classId: string) => `${MY_ACTIVITIES_PATH}?materia=${encodeURIComponent(classId)}`;
