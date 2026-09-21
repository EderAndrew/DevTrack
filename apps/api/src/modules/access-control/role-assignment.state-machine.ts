import type { RoleAssignmentStatus } from "../../generated/prisma/client";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Role assignment lifecycle (data-model.md, UserRole):
 *   ACTIVE ⇄ SUSPENDED;  ACTIVE | SUSPENDED → INACTIVE → ACTIVE.
 * A grant creates the assignment directly as ACTIVE; nothing else is allowed, including
 * "transitions" to the current status.
 */
const TRANSITIONS: Readonly<Record<RoleAssignmentStatus, readonly RoleAssignmentStatus[]>> = {
  ACTIVE: ["SUSPENDED", "INACTIVE"],
  SUSPENDED: ["ACTIVE", "INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export const RoleAssignmentStateMachine = {
  canTransition(from: RoleAssignmentStatus, to: RoleAssignmentStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Throws `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: RoleAssignmentStatus, to: RoleAssignmentStatus): void {
    if (!this.canTransition(from, to)) throw invalidStateTransition();
  },
};
