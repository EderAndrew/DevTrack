import type { StudentActivityStatus } from "@repo/contracts";
import { type ActivityFacts, hasConcluded, isPastDeadline } from "./facts";
import { canAnswer } from "./operations";

/** "Vence em menos de 48 horas" (spec Assumptions, FR-011). */
export const URGENT_WITHIN_MS = 48 * 60 * 60 * 1000;

/**
 * The student's situation, first match wins. ASSIGNMENT (012/FR-014): CORRIGIDO, ENTREGUE, ATRASADO,
 * EM_ANDAMENTO, PENDENTE; a closed activity without a submission counts as overdue. EXERCISE
 * (013/FR-014): CONCLUÍDA once any attempt is concluded, EM_ANDAMENTO with an open attempt,
 * PENDENTE otherwise — never overdue, submitted or graded.
 */
export function deriveStudentStatus(facts: ActivityFacts): StudentActivityStatus {
  if (facts.type === "EXERCISE") {
    if (hasConcluded(facts)) return "COMPLETED";
    return facts.latestAttempt?.status === "IN_PROGRESS" ? "IN_PROGRESS" : "PENDING";
  }
  if (facts.submission) return facts.released && facts.submission.gradingComplete ? "GRADED" : "SUBMITTED";
  if (isPastDeadline(facts) || facts.activityStatus === "CLOSED") return "OVERDUE";
  if (facts.attempt?.status === "IN_PROGRESS") return "IN_PROGRESS";
  return "PENDING";
}

/**
 * Highlighted as urgent (FR-011): not submitted and due within 48 hours, or overdue but still
 * accepting a submission. Other overdue activities show "Atrasada" without the highlight. An
 * EXERCISE has no deadline, so it is never urgent (013/FR-013).
 */
export function isUrgent(facts: ActivityFacts): boolean {
  if (facts.type === "EXERCISE") return false;
  if (facts.submission) return false;
  if (deriveStudentStatus(facts) === "OVERDUE") return canAnswer(facts);
  return facts.deadline.getTime() - facts.now.getTime() <= URGENT_WITHIN_MS;
}

/** The result reaches the student only released and complete (FR-029, research P14); an EXERCISE has none. */
export const isResultVisible = (facts: ActivityFacts): boolean =>
  facts.type === "ASSIGNMENT" && facts.released && facts.submission !== null && facts.submission.gradingComplete;
