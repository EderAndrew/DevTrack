import type { EnrollmentStatus } from "../../generated/prisma/client";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Enrollment lifecycle (003 data-model.md, FR-044): ACTIVE → REMOVED (terminal). Removing an
 * already removed enrollment is a no-op handled by the service; a new active enrollment is a
 * new row, so the history is kept.
 */
const TRANSITIONS: Readonly<Record<EnrollmentStatus, readonly EnrollmentStatus[]>> = {
  ACTIVE: ["REMOVED"],
  REMOVED: [],
};

export const EnrollmentStateMachine = {
  canTransition(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Throws `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: EnrollmentStatus, to: EnrollmentStatus): void {
    if (!this.canTransition(from, to)) throw invalidStateTransition();
  },
};
