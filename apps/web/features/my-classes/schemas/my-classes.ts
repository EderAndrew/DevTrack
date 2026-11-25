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

/**
 * One card of the 030 "Minhas turmas": a disciplina da turma with its turma's fields and the student's enrollment date,
 * or the turma alone when it has no disciplina yet (`classId` null: no "Acessar turma", no ranking).
 */
export interface SubjectCard {
  key: string;
  classId: string | null;
  cohortName: string;
  cohortCode: string;
  period: string | null;
  cohortStatus: MyCohort["status"];
  academicYear: number;
  enrolledAt: string;
  subjectName: string | null;
  teacherName: string | null;
  effectiveStatus: MyCohortClass["effectiveStatus"] | null;
}

/** Every card in the API's order (030 MT3): ano letivo desc, enrollment desc, disciplinas in the order they were added. */
export const subjectCards = (list: MyCohortList | undefined): SubjectCard[] =>
  (list?.years ?? []).flatMap(({ academicYear, cohorts }) =>
    cohorts.flatMap((cohort): SubjectCard[] => {
      const turma = {
        cohortName: cohort.name,
        cohortCode: cohort.code,
        period: cohort.period,
        cohortStatus: cohort.status,
        academicYear,
        enrolledAt: cohort.enrolledAt,
      };
      if (cohort.classes.length === 0) {
        return [{ key: `cohort:${cohort.id}`, classId: null, subjectName: null, teacherName: null, effectiveStatus: null, ...turma }];
      }
      return cohort.classes.map((item) => ({
        key: item.classId,
        classId: item.classId,
        subjectName: item.subjectName,
        teacherName: item.teacherName,
        effectiveStatus: item.effectiveStatus,
        ...turma,
      }));
    }),
  );

/** The card's badge (027): the turma's when it is not ACTIVE, else the disciplina's; none when both are ACTIVE. */
export const cardStatusBadge = (card: SubjectCard): string | null =>
  STATUS_BADGE[card.cohortStatus] ?? (card.effectiveStatus ? STATUS_BADGE[card.effectiveStatus] : null);

/** The card's highlight: the disciplina, or the turma's name (no "Disciplina" caption) without one (027/FR-030). */
export const cardHeading = (card: SubjectCard): { title: string; isSubject: boolean } =>
  card.subjectName ? { title: card.subjectName, isSubject: true } : { title: card.cohortName, isSubject: false };

export const PAGE_TITLE = "Minhas turmas";
export const PAGE_SUBTITLE = "Suas disciplinas, professores e rankings em um só lugar.";
export const RANKING_PANEL_TITLE = "Ranking da turma";
export const RANKING_PANEL_TEXT = "Confira a classificação e acompanhe sua posição nesta turma.";
export const NO_PERIOD = "—";
