import type { StudentActivityStatus } from "@repo/contracts";
import { type ActivityFacts, isPastDeadline } from "./facts";
import { canAnswer } from "./operations";

/** "Vence em menos de 48 horas" (spec Assumptions, FR-011). */
export const URGENT_WITHIN_MS = 48 * 60 * 60 * 1000;

/**
 * The student's situation (FR-014), first match wins: CORRIGIDO, ENTREGUE, ATRASADO, EM_ANDAMENTO,
 * PENDENTE. A closed activity without a submission counts as overdue: nothing more can be delivered.
 */
export function deriveStudentStatus(facts: ActivityFacts): StudentActivityStatus {
  if (facts.submission) return facts.released && facts.submission.gradingComplete ? "GRADED" : "SUBMITTED";
  if (isPastDeadline(facts) || facts.activityStatus === "CLOSED") return "OVERDUE";
  if (facts.attempt?.status === "IN_PROGRESS") return "IN_PROGRESS";
  return "PENDING";
}

/**
 * Highlighted as urgent (FR-011): not submitted and due within 48 hours, or overdue but still
 * accepting a submission. Other overdue activities show "Atrasada" without the highlight.
 */
export function isUrgent(facts: ActivityFacts): boolean {
  if (facts.submission) return false;
  if (deriveStudentStatus(facts) === "OVERDUE") return canAnswer(facts);
  return facts.deadline.getTime() - facts.now.getTime() <= URGENT_WITHIN_MS;
}

/** The result reaches the student only released and complete (FR-029, research P14). */
export const isResultVisible = (facts: Pick<ActivityFacts, "submission" | "released">): boolean =>
  facts.released && facts.submission !== null && facts.submission.gradingComplete;
