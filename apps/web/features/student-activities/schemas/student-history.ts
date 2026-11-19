import type { StudentHistoryItem } from "@repo/contracts";
import type { StatusVariant } from "@/components/ui/status";
import { gradePercent } from "./student-activity";

// Texts of 028 contracts/ui.md: they live in the web only (XXVI).

export const HISTORY_DESCRIPTION = "Acompanhe suas entregas, correções e resultados.";
export const HISTORY_LOADING = "Carregando seu histórico…";
export const HISTORY_EMPTY = "Você ainda não entregou nenhuma atividade.";
export const HISTORY_CAPTION = "Atividades que você entregou.";
export const HISTORY_ORDER = "Mais recentes primeiro";
export const HISTORY_FINAL_NOTE = "As notas aparecem aqui assim que a correção for concluída.";
export const VIEW_ACTIVITY = "Ver atividade";
export const AWAITING_GRADE = "Aguardando correção";
export const POINTS_AWAITING = "Pontos aguardando correção";

/** "Exibindo N de M atividades" (N = loaded rows, M = the server's `total`). */
export const historyFooter = (shown: number, total: number) => `Exibindo ${shown} de ${total} ${total === 1 ? "atividade" : "atividades"}`;

/** The three summary cards: title, caption and the accessible sentence with the whole number. */
export const HISTORY_CARDS = {
  delivered: { title: "Atividades entregues", caption: "Seu histórico de entregas", spoken: (n: number) => `${n} ${n === 1 ? "atividade entregue" : "atividades entregues"}` },
  awaiting: { title: "Aguardando correção", caption: "Você já fez a sua parte", spoken: (n: number) => `${n} aguardando correção` },
  graded: { title: "Atividades corrigidas", caption: "Resultado disponível", spoken: (n: number) => `${n} ${n === 1 ? "atividade corrigida" : "atividades corrigidas"}` },
} as const;

/** At least two digits: 4 → "04", 120 → "120". */
export const twoDigits = (n: number) => String(n).padStart(2, "0");

/** The bar of a grade: whole percent of the total, clamped 0–100; a total of 0 (or not in the contract's shape) is 0. */
export const historyGradePercent = (grade: string, total: string | null) => gradePercent(grade, total) ?? 0;

/** The class in two lines: the turma, then the subject (none without a subject). */
export const historyClassLines = (item: Pick<StudentHistoryItem, "class" | "subjectName">) => ({
  turma: item.class.name,
  subject: item.subjectName,
});

/**
 * The pill of a row (contracts/ui.md "Situação"): an exercise is "Concluída"; otherwise GRADED → "Corrigida" and
 * AWAITING → "Entregue", each "… com atraso" when the delivery was late.
 */
export function historyStatusLabel(item: Pick<StudentHistoryItem, "type" | "situation" | "late">): string {
  if (item.type === "EXERCISE") return "Concluída";
  const base = item.situation === "GRADED" ? "Corrigida" : "Entregue";
  return item.late ? `${base} com atraso` : base;
}

export const historyStatusVariant = (item: Pick<StudentHistoryItem, "type" | "situation">): StatusVariant =>
  item.type !== "EXERCISE" && item.situation === "AWAITING" ? "warning" : "success";

/** An exercise's points (013, never a grade): "45 de 60 pontos", or "Pontos aguardando correção". */
export function historyPoints(points: NonNullable<StudentHistoryItem["points"]>): string {
  return points.awaitingCorrection ? POINTS_AWAITING : `${points.earned} de ${points.possible} pontos`;
}
