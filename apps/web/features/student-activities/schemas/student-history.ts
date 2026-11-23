import type { StudentHistoryItem, StudentHistorySituation } from "@repo/contracts";
import type { StatusVariant } from "@/components/ui/status";
import { HISTORY_PATH } from "@/lib/navigation";
import type { StudentHistoryFilters } from "../api/student-activities";
import { gradePercent } from "./student-activity";

// Texts of 028 and 029 contracts/ui.md: they live in the web only (XXVI).

export const HISTORY_DESCRIPTION = "Provas e trabalhos encerrados ou cancelados pelo professor.";
export const HISTORY_LOADING = "Carregando seu histórico…";
export const HISTORY_EMPTY = "Nenhuma atividade encerrada ainda.";
export const HISTORY_CAPTION = "Atividades que você entregou.";
export const HISTORY_ORDER = "Mais recentes primeiro";
export const HISTORY_FINAL_NOTE = "As notas aparecem aqui assim que a correção for concluída.";
export const VIEW_ACTIVITY = "Ver atividade";
export const AWAITING_GRADE = "Aguardando correção";

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

/** 028 amendment (FR-024): the pill of an activity the student can no longer deliver. */
export const MISSED_LABEL = "Não entregue";

/**
 * The pill of a row (contracts/ui.md "Situação"): MISSED → "Não entregue"; otherwise GRADED → "Corrigida" and
 * AWAITING → "Entregue", each "… com atraso" when the delivery was late. 029/FR-001: never an exercise.
 */
export function historyStatusLabel(item: Pick<StudentHistoryItem, "situation" | "late">): string {
  if (item.situation === "MISSED") return MISSED_LABEL;
  const base = item.situation === "GRADED" ? "Corrigida" : "Entregue";
  return item.late ? `${base} com atraso` : base;
}

export const historyStatusVariant = (item: Pick<StudentHistoryItem, "situation">): StatusVariant =>
  item.situation === "MISSED" ? "neutral" : item.situation === "AWAITING" ? "warning" : "success";

/** The row's date (029/FR-006): the delivery when there is one, else when the teacher closed or cancelled it. */
export const historyDate = (item: Pick<StudentHistoryItem, "deliveredAt" | "endedAt">): string => item.deliveredAt ?? item.endedAt;

/**
 * The first line of the date (029 contracts/ui.md "Data"): the delivery's day, or "Encerrada em 13 de novembro" /
 * "Cancelada em 13 de novembro" when nothing was delivered.
 */
export function historyDateLabel(item: Pick<StudentHistoryItem, "deliveredAt" | "situation">, day: string): string {
  if (item.deliveredAt !== null) return day;
  return `${item.situation === "CANCELLED" ? "Cancelada" : "Encerrada"} em ${day}`;
}

/** The tabs (028/US2, contracts/ui.md "Toolbar"): label, the address's `aba` slug and the empty text of each. */
export const HISTORY_TABS = [
  { tab: null, slug: "todas", label: "Todas", count: "all", empty: HISTORY_EMPTY },
  { tab: "AWAITING", slug: "aguardando", label: "Aguardando", count: "awaiting", empty: "Nenhuma entrega aguardando correção." },
  { tab: "GRADED", slug: "corrigidas", label: "Corrigidas", count: "graded", empty: "Nenhuma entrega corrigida ainda." },
  { tab: "MISSED", slug: "nao-entregues", label: "Não entregues", count: "missed", empty: "Nenhuma atividade não entregue." },
] as const satisfies readonly {
  tab: StudentHistorySituation | null;
  slug: string;
  label: string;
  count: "all" | "awaiting" | "graded" | "missed";
  empty: string;
}[];

export type HistoryTabSpec = (typeof HISTORY_TABS)[number];

export const historyTabOf = (tab: StudentHistorySituation | null): HistoryTabSpec =>
  HISTORY_TABS.find((spec) => spec.tab === tab) ?? HISTORY_TABS[0];

/** The tab's accessible name with its count: "Aguardando, 3". */
export const historyTabName = (label: string, count: number) => `${label}, ${count}`;

/** The search box and the subject filter (028/US3, contracts/ui.md "Toolbar"). */
export const HISTORY_SEARCH_LABEL = "Buscar atividade";
export const HISTORY_SEARCH_PLACEHOLDER = "Buscar por nome da atividade";
export const HISTORY_SEARCH_WAIT_MS = 300;
export const ALL_SUBJECTS = "Todas as matérias";
export const NO_MATCH = "Nenhuma atividade encontrada.";
export const CLEAR_FILTERS = "Limpar busca e filtro";

/** The longest search, in code points (the API's `STUDENT_HISTORY_SEARCH_MAX`); a longer `busca` is cut, never sent. */
const SEARCH_MAX = 100;
const cutSearch = (text: string) => [...text.trim()].slice(0, SEARCH_MAX).join("").trim();

/**
 * The filters of the address (`?aba=&busca=&materia=`); an unknown `aba` is "Todas" (028/US2-5). `materia` is checked
 * against "Minhas turmas" before it is sent (026 research D6).
 */
export function historyFromSearch(search: { aba?: string | string[]; busca?: string | string[]; materia?: string | string[] }): StudentHistoryFilters {
  // A repeated parameter arrives as an array: only a single value counts.
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
  const spec = HISTORY_TABS.find((candidate) => candidate.slug === one(search.aba) && candidate.tab !== null);
  return { tab: spec?.tab ?? null, q: cutSearch(one(search.busca)), classId: one(search.materia) || null };
}

/** Whether a search or a subject narrows the list (the empty text is then "Nenhuma atividade encontrada."). */
export const historyFiltered = (filters: Pick<StudentHistoryFilters, "q" | "classId">) => filters.q.trim() !== "" || filters.classId !== null;

/** `/historico` with these filters in the address, in the order `aba`, `busca`, `materia` ("Todas" writes no `aba`). */
export function historyHref(filters: StudentHistoryFilters): string {
  const q = filters.q.trim();
  const query = new URLSearchParams({
    ...(filters.tab ? { aba: historyTabOf(filters.tab).slug } : {}),
    ...(q ? { busca: q } : {}),
    ...(filters.classId ? { materia: filters.classId } : {}),
  });
  return query.size > 0 ? `${HISTORY_PATH}?${query}` : HISTORY_PATH;
}
