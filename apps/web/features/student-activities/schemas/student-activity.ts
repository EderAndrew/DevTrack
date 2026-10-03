import {
  type ActivityType,
  ActivityTypeSchema,
  type StudentActivityFilter,
  StudentActivityFilterSchema,
  type StudentActivityStatus,
  type StudentActivitySummary,
} from "@repo/contracts";
import type { StatusVariant } from "@/components/ui/status";
import { MY_ACTIVITIES_PATH } from "@/lib/navigation";
import type { StudentActivityListFilters } from "../api/student-activities";

// Labels of 012 contracts/web-ui.md and contracts/student-status.md.
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = { EXERCISE: "Exercício", ASSIGNMENT: "Trabalho" };
export const STATUS_LABELS: Record<StudentActivityStatus, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  OVERDUE: "Atrasada",
  SUBMITTED: "Entregue",
  GRADED: "Corrigida",
};
export const STATUS_VARIANTS: Record<StudentActivityStatus, StatusVariant> = {
  PENDING: "info",
  IN_PROGRESS: "warning",
  OVERDUE: "danger",
  SUBMITTED: "success",
  GRADED: "success",
};

/** "Situação" filter of "Minhas atividades": the label and the URL value (`?situacao=`). */
export const FILTER_OPTIONS: Record<StudentActivityFilter, { label: string; slug: string }> = {
  PENDING: { label: "Pendentes", slug: "pendentes" },
  IN_PROGRESS: { label: "Em andamento", slug: "em-andamento" },
  COMPLETED: { label: "Entregues/concluídas", slug: "concluidas" },
  OVERDUE: { label: "Atrasadas", slug: "atrasadas" },
};
/** "Tipo" filter: the URL value (`?tipo=`). */
export const TYPE_SLUGS: Record<ActivityType, string> = { EXERCISE: "exercicio", ASSIGNMENT: "trabalho" };

export { MY_ACTIVITIES_PATH };

/** The filters of the URL; an unknown value is no filter. */
export function filtersFromSearch(search: { situacao?: string; tipo?: string }): StudentActivityListFilters {
  return {
    status: StudentActivityFilterSchema.options.find((filter) => FILTER_OPTIONS[filter].slug === search.situacao) ?? null,
    type: ActivityTypeSchema.options.find((type) => TYPE_SLUGS[type] === search.tipo) ?? null,
  };
}

/** `/minhas-atividades` with these filters in the URL. */
export function myActivitiesHref(filters: Partial<StudentActivityListFilters>): string {
  const query = new URLSearchParams({
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
      return "Ver resultado";
  }
}

/** The situation in words: "Entregue com atraso" when the submission was late. */
export const statusLabel = (item: Pick<StudentActivitySummary, "status" | "late">) =>
  item.late && (item.status === "SUBMITTED" || item.status === "GRADED") ? `${STATUS_LABELS[item.status]} com atraso` : STATUS_LABELS[item.status];

/** "0.90" → "0,90" (grades are shown with a comma). */
export const formatGrade = (grade: string) => grade.replace(".", ",");
