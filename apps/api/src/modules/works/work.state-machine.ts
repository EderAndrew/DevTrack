import type { WorkStatus } from "@repo/contracts";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Work lifecycle (011 data-model.md, FR-013, FR-016):
 *   DRAFT → APPROVED (approval by a person with `trabalhos.aprovar`);
 *   DRAFT | APPROVED → ARCHIVED (the previous status is kept in `archivedFromStatus`);
 *   ARCHIVED → the status it had before (restore).
 * Anything else, e.g. APPROVED → DRAFT or approving an archived work, → 409.
 */
const TRANSITIONS: Readonly<Record<WorkStatus, readonly WorkStatus[]>> = {
  DRAFT: ["APPROVED", "ARCHIVED"],
  APPROVED: ["ARCHIVED"],
  ARCHIVED: ["DRAFT", "APPROVED"],
};

export const WorkStateMachine = {
  /** `archivedFromStatus` matters only from ARCHIVED: the restore goes back to it and nowhere else. */
  canTransition(from: WorkStatus, to: WorkStatus, archivedFromStatus: WorkStatus | null = null): boolean {
    if (!TRANSITIONS[from].includes(to)) return false;
    return from !== "ARCHIVED" || archivedFromStatus === to;
  },

  /**
   * `false` when the work is already in `to` (no effect, no event), `true` for a valid
   * transition; anything else throws `409 INVALID_STATE_TRANSITION`.
   */
  transition(from: WorkStatus, to: WorkStatus, archivedFromStatus: WorkStatus | null = null): boolean {
    if (from === to) return false;
    if (!this.canTransition(from, to, archivedFromStatus)) throw invalidStateTransition();
    return true;
  },

  /** Where a restore goes: the status before archiving (DRAFT or APPROVED). */
  restoredStatus(archivedFromStatus: WorkStatus | null): WorkStatus {
    if (archivedFromStatus === null || archivedFromStatus === "ARCHIVED") throw invalidStateTransition();
    return archivedFromStatus;
  },

  /** Content can change only in DRAFT and APPROVED (FR-016). */
  isEditable(status: WorkStatus): boolean {
    return status !== "ARCHIVED";
  },

  /** An edit of an ARCHIVED work → 409. */
  assertEditable(status: WorkStatus): void {
    if (!this.isEditable(status)) throw invalidStateTransition();
  },
};
