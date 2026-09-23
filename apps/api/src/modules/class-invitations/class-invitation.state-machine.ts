import type { ClassInvitationStatus } from "../../generated/prisma/client";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Class invitation lifecycle (003 data-model.md, FR-014):
 *   PENDING → ACCEPTED | CANCELLED | EXPIRED (terminal);  PENDING → PENDING on resend.
 * Final invitations are never reopened: the teacher sends a new one.
 */
const TRANSITIONS: Readonly<Record<ClassInvitationStatus, readonly ClassInvitationStatus[]>> = {
  PENDING: ["ACCEPTED", "CANCELLED", "EXPIRED", "PENDING"],
  ACCEPTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const ClassInvitationStateMachine = {
  canTransition(from: ClassInvitationStatus, to: ClassInvitationStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Throws `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: ClassInvitationStatus, to: ClassInvitationStatus): void {
    if (!this.canTransition(from, to)) throw invalidStateTransition();
  },
};
