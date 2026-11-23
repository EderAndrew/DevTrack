import type { StudentActivityStatus, StudentActivitySummary, StudentHistorySituation } from "@repo/contracts";
import { decodeNameCursor, encodeNameCursor } from "../../platform/database/keyset";
import { validationError } from "../../platform/http/errors";
import type { StudentActivityInput } from "../activities/views/student-view";

/**
 * The pure parts of the student's "Histórico" (029 research HC1, HC4; 028 HI3, HI5, HI6): where an activity lives, the
 * situation and date of a history row, the order and cursor, and the title search. No I/O; `MyActivitiesService` feeds
 * them the scoped inputs.
 */

/** A row: the student's summary (the 012 allowlist) and its date — the delivery, else when it was closed or cancelled. */
export interface HistoryEntry {
  summary: StudentActivitySummary;
  at: Date;
}

/** What the placement reads (HC1). */
export type PlacementInput = Pick<StudentActivityInput, "type" | "facts">;

/**
 * HC1: the "Histórico" holds only the works and exams the teacher closed or cancelled. The class's or turma's status
 * does not move a row; every exercise stays in "Minhas atividades".
 */
export const inHistory = ({ type, facts }: PlacementInput): boolean =>
  type !== "EXERCISE" && (facts.activityStatus === "CLOSED" || facts.activityStatus === "CANCELLED");

/** HC1: "Minhas atividades" holds everything else, so each activity is in exactly one screen (029/SC-001). */
export const inList = (input: PlacementInput): boolean => !inHistory(input);

/** What a history row's situation and date read (HC4). */
export type HistoryInput = Pick<StudentActivityInput, "type" | "facts" | "submission" | "closedAt" | "cancelledAt">;

/**
 * HC4: a cancelled activity is CANCELLED whatever the delivery. A closed one with a delivery is GRADED only when the
 * student can see the result (its `result`: released ∧ grading complete ∧ `notas.proprias.visualizar`, 028 HI3), else
 * AWAITING; an exam held for the teacher's decision without a delivery is AWAITING too; otherwise MISSED.
 */
export const historySituation = (input: HistoryInput, summary: Pick<StudentActivitySummary, "result">): StudentHistorySituation => {
  if (input.facts.activityStatus === "CANCELLED") return "CANCELLED";
  if (input.submission !== null) return summary.result !== null ? "GRADED" : "AWAITING";
  if (input.facts.type === "EXAM" && input.facts.onHold === true) return "AWAITING";
  return "MISSED";
};

/** The submission's moment; null without one (a missed row, a held exam, a cancelled one never delivered). */
export const deliveredAt = (input: Pick<StudentActivityInput, "submission">): Date | null => input.submission?.submittedAt ?? null;

/**
 * HC4: when the teacher ended the activity — `cancelledAt` for a cancelled one (even if closed before), `closedAt` for a
 * closed one. A CHECK of `class_activities` requires each date with its status, so there is no fallback; an ACTIVE
 * activity is never in the history, so asking is a programming error.
 */
export const endedAt = (input: Pick<StudentActivityInput, "facts" | "closedAt" | "cancelledAt">): Date => {
  const moment = input.facts.activityStatus === "CANCELLED" ? input.cancelledAt : input.facts.activityStatus === "CLOSED" ? input.closedAt : null;
  if (moment === null) throw new Error(`no end date for a ${input.facts.activityStatus} activity in the history`);
  return moment;
};

/** HC4: the row's date, shown and ordered: the delivery when there is one, else the end. */
export const rowDate = (input: Pick<StudentActivityInput, "facts" | "submission" | "closedAt" | "cancelledAt">): Date =>
  deliveredAt(input) ?? endedAt(input);

/** The statuses of a delivery: a work or exam handed in (graded or not), an exercise concluded. */
export const DELIVERED_STATUSES: readonly StudentActivityStatus[] = ["SUBMITTED", "GRADED", "COMPLETED"];

/** HI5, HC4: newest first by the row's date, ties by id ascending. */
export const byDelivery = (a: HistoryEntry, b: HistoryEntry): number => b.at.getTime() - a.at.getTime() || a.summary.id.localeCompare(b.summary.id);

/** The opaque cursor after `entry` (the keyset helper over `{ name: at ISO, id }`). */
export const historyCursor = (entry: HistoryEntry): string => encodeNameCursor({ name: entry.at.toISOString(), id: entry.summary.id });

/**
 * A predicate for the entries strictly after `cursor` in `byDelivery` order. A cursor the API didn't produce (or whose
 * date doesn't parse) → `400 VALIDATION_ERROR`, before any filtering.
 */
export const afterCursor = (cursor: string): ((entry: HistoryEntry) => boolean) => {
  const { name, id } = decodeNameCursor(cursor);
  const time = Date.parse(name);
  if (Number.isNaN(time)) throw validationError();
  return (entry) => {
    const own = entry.at.getTime();
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
