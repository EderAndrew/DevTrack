import {
  type Answer,
  type ActivityType,
  ActivityTypeSchema,
  type ExerciseResult,
  type StudentActivityFilter,
  StudentActivityFilterSchema,
  type StudentActivityStatus,
  type StudentActivitySummary,
  type StudentQuestion,
  type WorkQuestionType,
} from "@repo/contracts";
import type { StatusVariant } from "@/components/ui/status";
import { type MySubjectClass, STATUS_BADGE } from "@/features/my-classes/schemas/my-classes";
import { MY_ACTIVITIES_PATH } from "@/lib/navigation";
import type { StudentActivityListFilters } from "../api/student-activities";

// Labels of 012 contracts/web-ui.md and contracts/student-status.md.
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = { EXERCISE: "Exercício", ASSIGNMENT: "Trabalho", EXAM: "Prova" };
export const STATUS_LABELS: Record<StudentActivityStatus, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  OVERDUE: "Atrasada",
  SUBMITTED: "Entregue",
  GRADED: "Corrigida",
  COMPLETED: "Concluída",
};
export const STATUS_VARIANTS: Record<StudentActivityStatus, StatusVariant> = {
  PENDING: "info",
  IN_PROGRESS: "warning",
  OVERDUE: "danger",
  SUBMITTED: "success",
  GRADED: "success",
  COMPLETED: "success",
};

/**
 * "Situação" filter of "Minhas atividades": the label and the URL value (`?situacao=`). "Entregues/concluídas" is back
 * in 029 (FR-008): delivered active works and exams and concluded exercises stay in the list.
 */
export const FILTER_OPTIONS: Record<StudentActivityFilter, { label: string; slug: string }> = {
  PENDING: { label: "Pendentes", slug: "pendentes" },
  IN_PROGRESS: { label: "Em andamento", slug: "em-andamento" },
  OVERDUE: { label: "Atrasadas", slug: "atrasadas" },
  COMPLETED: { label: "Entregues/concluídas", slug: "concluidas" },
};
/** "Tipo" filter: the URL value (`?tipo=`). */
export const TYPE_SLUGS: Record<ActivityType, string> = { EXERCISE: "exercicio", ASSIGNMENT: "trabalho", EXAM: "prova" };

export { MY_ACTIVITIES_PATH };

/** The filters of the URL; an unknown value is no filter. */
export function filtersFromSearch(search: { situacao?: string; tipo?: string }): StudentActivityListFilters {
  return {
    status: StudentActivityFilterSchema.options.find((filter) => FILTER_OPTIONS[filter].slug === search.situacao) ?? null,
    type: ActivityTypeSchema.options.find((type) => TYPE_SLUGS[type] === search.tipo) ?? null,
  };
}

/** `/minhas-atividades` with the subject (026, `materia=<classId>`, written first) and these filters in the URL. */
export function myActivitiesHref(filters: Partial<StudentActivityListFilters> & { materia?: string | null }): string {
  const query = new URLSearchParams({
    ...(filters.materia ? { materia: filters.materia } : {}),
    ...(filters.status ? { situacao: FILTER_OPTIONS[filters.status].slug } : {}),
    ...(filters.type ? { tipo: TYPE_SLUGS[filters.type] } : {}),
  });
  return query.size > 0 ? `${MY_ACTIVITIES_PATH}?${query}` : MY_ACTIVITIES_PATH;
}

export const activityHref = (activityId: string) => `${MY_ACTIVITIES_PATH}/${activityId}`;

/** The action the card offers (contracts/student-status.md, "Action shown"). */
export function actionLabel(item: Pick<StudentActivitySummary, "status" | "canAnswer">): string {
  switch (item.status) {
    case "PENDING":
      return item.canAnswer ? "Iniciar" : "Ver atividade";
    case "IN_PROGRESS":
      return item.canAnswer ? "Continuar" : "Ver atividade";
    case "OVERDUE":
      return item.canAnswer ? "Entregar com atraso" : "Ver atividade";
    case "SUBMITTED":
      return "Ver entrega";
    case "GRADED":
    case "COMPLETED":
      return "Ver resultado";
  }
}

/** The situation in words: "Entregue com atraso" when the submission was late. */
export const statusLabel = (item: Pick<StudentActivitySummary, "status" | "late">) =>
  item.late && (item.status === "SUBMITTED" || item.status === "GRADED") ? `${STATUS_LABELS[item.status]} com atraso` : STATUS_LABELS[item.status];

/** "0.90" → "0,90" (grades are shown with a comma). */
export const formatGrade = (grade: string) => grade.replace(".", ",");

/** Question types as the student reads them (012 contracts/web-ui.md). */
export const QUESTION_TYPE_LABELS: Record<WorkQuestionType, string> = {
  OPEN_ANSWER: "Pergunta e resposta",
  MULTIPLE_CHOICE: "Múltipla escolha",
  CODE: "Código",
};

/** Practice points as an integer, never a grade (013 K18): "1 ponto", "30 pontos". */
export const formatPoints = (points: number) => `${points} ${points === 1 ? "ponto" : "pontos"}`;

/** An Exercício's result per question (013 contracts/student-status.md), said in words. */
export const RESULT_LABELS: Record<ExerciseResult, string> = {
  CORRECT: "Certo",
  WRONG: "Errado",
  PENDING_TEACHER: "Aguardando correção",
  UNSCORED: "Compare com o gabarito",
};
export const RESULT_VARIANTS: Record<ExerciseResult, StatusVariant> = {
  CORRECT: "success",
  WRONG: "danger",
  PENDING_TEACHER: "warning",
  UNSCORED: "info",
};

/** "Pontos: 45 de 105" of an Exercício's card (013 contracts/web-ui.md). */
export const pointsSummary = (points: { possible: number; earned: number }) => `${points.earned} de ${points.possible}`;

/**
 * The larger score of a "Minhas atividades" card: only a released grade (the API sends `result` only then, 012) or
 * an exercise's points (013, never called a grade). Points are partial until the conclusion and its correction.
 */
export function cardScore(item: Pick<StudentActivitySummary, "status" | "result" | "points">): { value: string; label: string } | null {
  if (item.result) return { value: formatGrade(item.result.grade), label: "Nota" };
  if (!item.points) return null;
  const concluded = item.status === "COMPLETED" || item.status === "SUBMITTED" || item.status === "GRADED";
  return { value: String(item.points.earned), label: concluded && !item.points.awaitingCorrection ? "Pontos" : "Pontos parciais" };
}

/** A grade of the contract ("0.60", two decimals) in whole hundredths (60); null when it is not in that shape. */
function toHundredths(grade: string): number | null {
  const match = /^(\d+)\.(\d{2})$/.exec(grade);
  return match ? parseInt(`${match[1]}${match[2]}`, 10) : null;
}

/** A whole percentage of `part` over `whole`, both integers; null without a whole. Only for display (a bar and "80%"). */
export function wholePercent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((part * 100) / whole)));
}

/** The released grade as a share of the activity's total (0,60 of 0,75 → 80), in whole hundredths, never floats (012). */
export function gradePercent(grade: string, total: string | null): number | null {
  if (total === null) return null;
  const earned = toHundredths(grade);
  const possible = toHundredths(total);
  return earned === null || possible === null ? null : wholePercent(earned, possible);
}

/** Whole hundredths written as a grade: 85 → "0,85", 1250 → "12,50" (integer arithmetic only, 012). */
export function formatHundredths(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const cents = hundredths % 100;
  return `${whole},${cents < 10 ? "0" : ""}${cents}`;
}

export interface GradeSummary {
  /** Activities with a released grade (the API sends `result` only after the release, 012). */
  graded: number;
  /** Sum of those grades and of their maximum grades, in whole hundredths. */
  earned: number;
  possible: number;
  /** `earned` over `possible`, whole percent; null with nothing graded. */
  percent: number | null;
}

/**
 * The summary cards of "Minhas atividades" over the activities on screen (the list is paged and the API sends no
 * total, so the cards say "nas atividades exibidas"). Only released grades count; an Exercício's points never mix
 * with grades (013), and an activity whose grades are not in the contract's shape is left out.
 */
export function gradeSummary(items: readonly Pick<StudentActivitySummary, "result" | "totalGrade">[]): GradeSummary {
  let graded = 0;
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    if (!item.result || item.totalGrade === null) continue;
    const grade = toHundredths(item.result.grade);
    const total = toHundredths(item.totalGrade);
    if (grade === null || total === null) continue;
    graded += 1;
    earned += grade;
    possible += total;
  }
  return { graded, earned, possible, percent: graded > 0 ? wholePercent(earned, possible) : null };
}

/** The subject card (026, contracts/ui.md "SubjectSwitcher"). */
export const SUBJECT_LABEL = "Matéria";
export const ONLY_SUBJECT = "Sua única matéria";
export const SUBJECT_UNAVAILABLE = "Essa matéria não está mais disponível para você.";

/** The subject of the page address (`?materia=<classId>`); empty is none. Checked against "Minhas turmas", never sent unchecked. */
export const subjectFromSearch = (search: { materia?: string }): string | null => search.materia || null;

type SubjectClass = Pick<MySubjectClass, "id" | "name" | "subjectName" | "period" | "teacherName" | "status">;

const baseSubjectLabel = (item: SubjectClass) => (item.subjectName ? `${item.subjectName} · ${item.name}` : item.name);

/**
 * "<disciplina> · <turma>" (only "<turma>" without a subject); two classes that would read the same get the period and the
 * teacher (026 research D7).
 */
export function subjectLabel(item: SubjectClass, all: readonly SubjectClass[]): string {
  const base = baseSubjectLabel(item);
  const tied = all.some((other) => other.id !== item.id && baseSubjectLabel(other) === base);
  if (!tied) return base;
  return [base, item.period, item.teacherName].filter((part): part is string => Boolean(part)).join(" · ");
}

/**
 * The card's options, in the order given (the ACTIVE disciplinas of "Minhas turmas", 027/US8); a read-only one says so
 * ("· Encerrada", "· Arquivada").
 */
export const subjectOptions = (items: readonly SubjectClass[]) =>
  items.map((item) => {
    const badge = STATUS_BADGE[item.status];
    return { id: item.id, label: badge ? `${subjectLabel(item, items)} · ${badge}` : subjectLabel(item, items) };
  });

/** "Vale 0,50" (a Trabalho's question) or "Vale 30 pontos" (an Exercício's, 013/FR-003). */
export const valueLabel = (question: { value: string | null; points: number | null }) =>
  question.value !== null ? `Vale ${formatGrade(question.value)}` : `Vale ${formatPoints(question.points ?? 0)}`;

/**
 * Whether the navigator shows the question as answered: the display side of the server's blank
 * rule (contracts/student-status.md) — the server counts the blank questions at submission.
 */
export function isAnswered(question: Pick<StudentQuestion, "starterCode">, answer: Answer | null): boolean {
  if (answer === null) return false;
  if (answer.kind === "ALTERNATIVE") return answer.alternativeId !== null;
  if (answer.kind === "TEXT") return answer.text.trim() !== "";
  return answer.source.trim() !== "" && answer.source !== question.starterCode;
}

/** The answer a question starts with on screen: its starter code for code, empty otherwise. */
export function emptyAnswer(question: Pick<StudentQuestion, "type" | "starterCode">): Answer {
  if (question.type === "MULTIPLE_CHOICE") return { kind: "ALTERNATIVE", alternativeId: null };
  if (question.type === "CODE") return { kind: "CODE", source: question.starterCode ?? "" };
  return { kind: "TEXT", text: "" };
}

/** Limit of an open answer (011 `AnswerSchema`). */
export const ESSAY_MAX_LENGTH = 20_000;
