import type { StudentActivityStatus, StudentActivitySummary, StudentHistorySituation } from "@repo/contracts";
import { decodeNameCursor, encodeNameCursor } from "../../platform/database/keyset";
import { validationError } from "../../platform/http/errors";
import { isPastDeadline, isStartClosed } from "../activities/status/facts";
import { canAnswer } from "../activities/status/operations";
import { deriveStudentStatus } from "../activities/status/student-status";
import type { StudentActivityInput } from "../activities/views/student-view";

/**
 * The pure parts of the student's "Histórico" (028 research HI3–HI6, HI11): the situation of a delivery, its date, what
 * the student can no longer deliver ("não entregue"), the order and cursor, and the title search. No I/O;
 * `MyActivitiesService` feeds them the scoped inputs.
 */

/** A row: the student's summary (the 012 allowlist) and its date — the delivery, or when it was missed (HI11). */
export interface HistoryEntry {
  summary: StudentActivitySummary;
  at: Date;
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

/** The statuses of a delivery: a work or exam handed in (graded or not), an exercise concluded. */
export const DELIVERED_STATUSES: readonly StudentActivityStatus[] = ["SUBMITTED", "GRADED", "COMPLETED"];

/** The inputs `isMissed` and `missedAt` read (HI11). */
export type MissedInput = Pick<StudentActivityInput, "facts" | "publishAt" | "closedAt" | "inactiveSince">;

/**
 * HI11 (amendment 2026-11-23): "não entregue" — no delivery and the student can no longer start or continue it (the
 * 012 `canAnswer`: closed, class or turma not ACTIVE, deadline passed under REJECT, exam start window closed). A held
 * exam waits for the teacher's decision, so it is never missed; a 016 pause doesn't change `canAnswer`.
 */
export const isMissed = ({ facts }: Pick<MissedInput, "facts">): boolean => {
  if (DELIVERED_STATUSES.includes(deriveStudentStatus(facts))) return false;
  if (facts.type === "EXAM" && facts.onHold === true) return false;
  return !canAnswer(facts);
};

/**
 * When a missed activity stopped accepting a delivery: the earliest of the deadline passed under REJECT, the exam's
 * start-window end without an attempt, the activity's close and the moment the class or turma stopped being ACTIVE;
 * the publication when none was recorded (an old row).
 */
export const missedAt = (input: MissedInput): Date => {
  const { facts } = input;
  const moments: Date[] = [];
  if (facts.type === "ASSIGNMENT" && facts.latePolicy === "REJECT" && isPastDeadline(facts)) moments.push(facts.deadline);
  if (facts.type === "EXAM" && facts.attempt === null && isStartClosed(facts)) moments.push(facts.startDeadline);
  if (facts.activityStatus === "CLOSED" && input.closedAt !== null) moments.push(input.closedAt);
  if (!facts.classActive && input.inactiveSince !== null) moments.push(input.inactiveSince);
  return moments.reduce((earliest, moment) => (moment.getTime() < earliest.getTime() ? moment : earliest), moments[0] ?? input.publishAt);
};

/** HI5: newest first (the delivery, or when it was missed), ties by id ascending. */
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
