import type { Answer, WorkQuestionType } from "@repo/contracts";

/** `activity_attempt.progress_saved` at most once per 15 minutes per attempt (research P19). */
export const PROGRESS_AUDIT_INTERVAL_MS = 15 * 60 * 1000;

/** The kind of answer each question type takes (FR-020; the CHECK of `activity_answers`). */
const KIND_OF: Record<WorkQuestionType, Answer["kind"]> = { OPEN_ANSWER: "TEXT", MULTIPLE_CHOICE: "ALTERNATIVE", CODE: "CODE" };

/** What the answer rules read of a snapshot question. */
export interface AnswerableQuestion {
  type: WorkQuestionType;
  starterCode: string | null;
  alternativeIds: readonly string[];
}

/** An answer of the question's kind and, for multiple choice, blank or one of its own alternatives. */
export function answerFits(question: AnswerableQuestion, answer: Answer): boolean {
  if (KIND_OF[question.type] !== answer.kind) return false;
  return answer.kind !== "ALTERNATIVE" || answer.alternativeId === null || question.alternativeIds.includes(answer.alternativeId);
}

/** Same content: a retry of a save that already landed is UNCHANGED (research P8). */
export function sameAnswer(a: Answer, b: Answer): boolean {
  if (a.kind === "TEXT" && b.kind === "TEXT") return a.text === b.text;
  if (a.kind === "ALTERNATIVE" && b.kind === "ALTERNATIVE") return a.alternativeId === b.alternativeId;
  if (a.kind === "CODE" && b.kind === "CODE") return a.source === b.source;
  return false;
}

/**
 * A blank question (FR-023, contracts/student-status.md): no saved answer, a multiple choice with no
 * alternative, a text empty after trim, or code empty after trim or identical to the starter code.
 */
export function isBlankAnswer(question: Pick<AnswerableQuestion, "starterCode">, answer: Answer | null): boolean {
  if (answer === null) return true;
  if (answer.kind === "ALTERNATIVE") return answer.alternativeId === null;
  if (answer.kind === "TEXT") return answer.text.trim() === "";
  return answer.source.trim() === "" || answer.source === question.starterCode;
}

/** The progress of an attempt is audited again only after the interval (research P19). */
export const progressAuditDue = (lastAuditedAt: Date | null, now: Date): boolean =>
  lastAuditedAt === null || now.getTime() - lastAuditedAt.getTime() >= PROGRESS_AUDIT_INTERVAL_MS;

/** A stored answer row, typed by its question (the CHECK of `activity_answers`). */
export interface AnswerRow {
  questionType: WorkQuestionType;
  text: string | null;
  alternativeId: string | null;
  source: string | null;
}

/** A stored answer back in the 011 `Answer` shape. */
export function answerOfRow(row: AnswerRow): Answer {
  if (row.questionType === "OPEN_ANSWER") return { kind: "TEXT", text: row.text ?? "" };
  if (row.questionType === "MULTIPLE_CHOICE") return { kind: "ALTERNATIVE", alternativeId: row.alternativeId };
  return { kind: "CODE", source: row.source ?? "" };
}

/** The typed columns of an answer: only the one of its kind is set. */
export function columnsOf(answer: Answer): { text: string | null; alternativeId: string | null; source: string | null } {
  return {
    text: answer.kind === "TEXT" ? answer.text : null,
    alternativeId: answer.kind === "ALTERNATIVE" ? answer.alternativeId : null,
    source: answer.kind === "CODE" ? answer.source : null,
  };
}
