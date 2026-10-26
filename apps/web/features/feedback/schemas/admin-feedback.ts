import type { FeedbackCategory, FeedbackStatus } from "@repo/contracts";

// Texts and URL filters of the ADMIN's "Feedbacks" (020 contracts/web-ui.md, "ADMIN"). Statuses are
// said in words; the badge colour only repeats them.

export const ADMIN_FEEDBACKS_PATH = "/admin/feedbacks";
export const ADMIN_FEEDBACKS_TITLE = "Feedbacks dos alunos";
export const NO_FEEDBACKS = "Nenhum feedback com esses filtros.";
export const STATUS_CONFLICT = "Outra pessoa já mudou esta situação. Atualizamos a página.";
export const NO_HISTORY = "Sem mudanças ainda.";
export const NO_ORIGIN = "Não registrada";

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  RECEIVED: "Recebido",
  IN_REVIEW: "Em análise",
  RESOLVED: "Resolvido",
  ARCHIVED: "Arquivado",
};

export const statusChanged = (status: FeedbackStatus) => `Situação alterada para ${STATUS_LABELS[status]}.`;

/** "Feedbacks, N novos": the menu item's accessible name with the badge. */
export const unreadLabel = (count: number) => (count === 1 ? "1 novo" : `${count} novos`);

/**
 * The buttons of "Mudar situação" for each status (UX only; the API decides with `feedback-state.ts`
 * and answers 409 otherwise). RESOLVED and ARCHIVED reopen through IN_REVIEW.
 */
export const STATUS_ACTIONS: Record<FeedbackStatus, readonly { to: Exclude<FeedbackStatus, "RECEIVED">; label: string }[]> = {
  RECEIVED: [
    { to: "IN_REVIEW", label: "Em análise" },
    { to: "RESOLVED", label: "Resolvido" },
    { to: "ARCHIVED", label: "Arquivar" },
  ],
  IN_REVIEW: [
    { to: "RESOLVED", label: "Resolvido" },
    { to: "ARCHIVED", label: "Arquivar" },
  ],
  RESOLVED: [{ to: "IN_REVIEW", label: "Reabrir" }],
  ARCHIVED: [{ to: "IN_REVIEW", label: "Reabrir" }],
};

/** `?situacao=` and `?categoria=` values, in Portuguese like the rest of the URL. */
const STATUS_SLUGS: Record<FeedbackStatus, string> = {
  RECEIVED: "recebido",
  IN_REVIEW: "em-analise",
  RESOLVED: "resolvido",
  ARCHIVED: "arquivado",
};
const CATEGORY_SLUGS: Record<FeedbackCategory, string> = {
  PROBLEM: "problema",
  SUGGESTION: "sugestao",
  PRAISE: "elogio",
  OTHER: "outro",
};

export interface AdminFeedbackFilters {
  status?: FeedbackStatus;
  category?: FeedbackCategory;
}

const fromSlug = <K extends string>(slugs: Record<K, string>, value: unknown): K | undefined =>
  (Object.keys(slugs) as K[]).find((key) => slugs[key] === value);

/** The filters of a URL; an unknown or repeated value means "Todas". */
export const filtersFromSearch = (params: { situacao?: string | string[]; categoria?: string | string[] }): AdminFeedbackFilters => ({
  status: fromSlug(STATUS_SLUGS, params.situacao),
  category: fromSlug(CATEGORY_SLUGS, params.categoria),
});

/** The list's URL for `filters`, so a reload or a shared link keeps them. */
export function filtersHref({ status, category }: AdminFeedbackFilters): string {
  const query = new URLSearchParams();
  if (status) query.set("situacao", STATUS_SLUGS[status]);
  if (category) query.set("categoria", CATEGORY_SLUGS[category]);
  const search = query.toString();
  return search ? `${ADMIN_FEEDBACKS_PATH}?${search}` : ADMIN_FEEDBACKS_PATH;
}
