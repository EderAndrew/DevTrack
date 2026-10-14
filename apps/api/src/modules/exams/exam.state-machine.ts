import type { ExamStatus } from "@repo/contracts";
import { AppException, invalidStateTransition } from "../../platform/http/errors";

/**
 * Exam lifecycle (018/FR-004, data-model "State transitions"):
 *   DRAFT → APPROVED (by a person with `provas.aprovar`);
 *   DRAFT | APPROVED → ARCHIVED (the previous status kept in `archivedFromStatus`);
 *   ARCHIVED → the status it had before (restore).
 * Anything else → 409.
 */
const TRANSITIONS: Readonly<Record<ExamStatus, readonly ExamStatus[]>> = {
  DRAFT: ["APPROVED", "ARCHIVED"],
  APPROVED: ["ARCHIVED"],
  ARCHIVED: ["DRAFT", "APPROVED"],
};

export const ExamStateMachine = {
  /** `archivedFromStatus` matters only from ARCHIVED: the restore goes back to it and nowhere else. */
  canTransition(from: ExamStatus, to: ExamStatus, archivedFromStatus: ExamStatus | null = null): boolean {
    if (!TRANSITIONS[from].includes(to)) return false;
    return from !== "ARCHIVED" || archivedFromStatus === to;
  },

  /** `false` when already in `to` (no effect, no event), `true` for a valid transition; anything else → 409. */
  transition(from: ExamStatus, to: ExamStatus, archivedFromStatus: ExamStatus | null = null): boolean {
    if (from === to) return false;
    if (!this.canTransition(from, to, archivedFromStatus)) throw invalidStateTransition();
    return true;
  },

  /** Where a restore goes: the status before archiving. */
  restoredStatus(archivedFromStatus: ExamStatus | null): ExamStatus {
    if (archivedFromStatus === null || archivedFromStatus === "ARCHIVED") throw invalidStateTransition();
    return archivedFromStatus;
  },

  /** Content and approval only outside ARCHIVED: `409 EXAM_ARCHIVED` (contracts/http-api.md). */
  assertNotArchived(status: ExamStatus): void {
    if (status === "ARCHIVED") throw new AppException("EXAM_ARCHIVED");
  },
};
