import type { ExerciseStatus } from "@repo/contracts";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Exercise lifecycle (010 data-model.md, FR-010, FR-015):
 *   DRAFT → APPROVED (approval by a person with `questoes.aprovar`);
 *   DRAFT | APPROVED → ARCHIVED (the previous status is kept in `archivedFromStatus`);
 *   ARCHIVED → the status it had before (restore).
 * Anything else, e.g. APPROVED → DRAFT or approving an archived exercise, → 409.
 */
const TRANSITIONS: Readonly<Record<ExerciseStatus, readonly ExerciseStatus[]>> = {
  DRAFT: ["APPROVED", "ARCHIVED"],
  APPROVED: ["ARCHIVED"],
  ARCHIVED: ["DRAFT", "APPROVED"],
};

export const ExerciseStateMachine = {
  /** `archivedFromStatus` matters only from ARCHIVED: the restore goes back to it and nowhere else. */
  canTransition(from: ExerciseStatus, to: ExerciseStatus, archivedFromStatus: ExerciseStatus | null = null): boolean {
    if (!TRANSITIONS[from].includes(to)) return false;
    return from !== "ARCHIVED" || archivedFromStatus === to;
  },

  /**
   * `false` when the exercise is already in `to` (no effect, no event), `true` for a valid
   * transition; anything else throws `409 INVALID_STATE_TRANSITION`.
   */
  transition(from: ExerciseStatus, to: ExerciseStatus, archivedFromStatus: ExerciseStatus | null = null): boolean {
    if (from === to) return false;
    if (!this.canTransition(from, to, archivedFromStatus)) throw invalidStateTransition();
    return true;
  },

  /** Where a restore goes: the status before archiving (DRAFT or APPROVED). */
  restoredStatus(archivedFromStatus: ExerciseStatus | null): ExerciseStatus {
    if (archivedFromStatus === null || archivedFromStatus === "ARCHIVED") throw invalidStateTransition();
    return archivedFromStatus;
  },

  /** Content can change only before archiving (FR-015). */
  isEditable(status: ExerciseStatus): boolean {
    return status !== "ARCHIVED";
  },
};
