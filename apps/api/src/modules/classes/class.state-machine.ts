import type { ClassStatus } from "../../generated/prisma/client";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Class lifecycle (003 data-model.md, FR-004):
 *   ACTIVE ⇄ INACTIVE;  ACTIVE | INACTIVE → ARCHIVED (terminal in this feature).
 * Asking for the current status is a no-op handled by the service, not a transition.
 */
const TRANSITIONS: Readonly<Record<ClassStatus, readonly ClassStatus[]>> = {
  ACTIVE: ["INACTIVE", "ARCHIVED"],
  INACTIVE: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

export const ClassStateMachine = {
  canTransition(from: ClassStatus, to: ClassStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Throws `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: ClassStatus, to: ClassStatus): void {
    if (!this.canTransition(from, to)) throw invalidStateTransition();
  },
};
