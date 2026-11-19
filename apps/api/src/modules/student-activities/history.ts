import type { StudentActivitySummary, StudentHistorySituation } from "@repo/contracts";
import { decodeNameCursor, encodeNameCursor } from "../../platform/database/keyset";
import { validationError } from "../../platform/http/errors";
import type { StudentActivityInput } from "../activities/views/student-view";

/**
 * The pure parts of the student's "Histórico" (028 research HI3–HI6): the situation of a delivery, its date, the order
 * and cursor, and the title search. No I/O; `MyActivitiesService.history` feeds them the scoped summaries.
 */

/** A delivery: the student's summary (the 012 allowlist) and when it was delivered. */
export interface HistoryEntry {
  summary: StudentActivitySummary;
  deliveredAt: Date;
}

/**
 * HI3: GRADED only when the student can see the result — for a work or an exam, its `result` (released ∧ grading
 * complete ∧ `notas.proprias.visualizar`, the 012 gate); for an exercise, nothing awaits the teacher's mark.
 */
export const historySituation = (summary: StudentActivitySummary): StudentHistorySituation => {
  if (summary.type === "EXERCISE") return summary.points?.awaitingCorrection ? "AWAITING" : "GRADED";
  return summary.result !== null ? "GRADED" : "AWAITING";
};

/** HI4: the submission, or the exercise's attempt-1 conclusion; null for what was never delivered. */
export const deliveredAt = (input: StudentActivityInput): Date | null => input.submission?.submittedAt ?? input.firstCompletedAt;

/** HI5: newest delivery first, ties by id ascending. */
export const byDelivery = (a: HistoryEntry, b: HistoryEntry): number =>
  b.deliveredAt.getTime() - a.deliveredAt.getTime() || a.summary.id.localeCompare(b.summary.id);

/** The opaque cursor after `entry` (the keyset helper over `{ name: deliveredAt ISO, id }`). */
export const historyCursor = (entry: HistoryEntry): string =>
  encodeNameCursor({ name: entry.deliveredAt.toISOString(), id: entry.summary.id });

/**
 * A predicate for the entries strictly after `cursor` in `byDelivery` order. A cursor the API didn't produce (or whose
 * date doesn't parse) → `400 VALIDATION_ERROR`, before any filtering.
 */
export const afterCursor = (cursor: string): ((entry: HistoryEntry) => boolean) => {
  const { name, id } = decodeNameCursor(cursor);
  const time = Date.parse(name);
  if (Number.isNaN(time)) throw validationError();
  return (entry) => {
    const own = entry.deliveredAt.getTime();
    return own < time || (own === time && entry.summary.id.localeCompare(id) > 0);
  };
};

/** HI6: accents dropped, lower case — a plain string for `includes`, never a pattern. */
export const normalizeSearch = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();

/** Contains, case- and accent-insensitive; an absent or blank search matches every title. */
export const matchesSearch = (title: string, q: string | undefined): boolean => {
  const needle = q === undefined ? "" : normalizeSearch(q);
  return needle === "" || normalizeSearch(title).includes(needle);
};
