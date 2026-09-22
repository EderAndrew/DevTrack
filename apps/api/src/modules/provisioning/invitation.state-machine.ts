import type { InvitationStatus } from "../../generated/prisma/client";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Invitation lifecycle (data-model.md, FR-041):
 *   PENDING → ACCEPTED | REVOKED | EXPIRED (terminal);  PENDING → PENDING on resend.
 * EXPIRED and REVOKED invitations are never reopened: the issuer creates another one.
 */
const TRANSITIONS: Readonly<Record<InvitationStatus, readonly InvitationStatus[]>> = {
  PENDING: ["ACCEPTED", "REVOKED", "EXPIRED", "PENDING"],
  ACCEPTED: [],
  EXPIRED: [],
  REVOKED: [],
};

export const InvitationStateMachine = {
  canTransition(from: InvitationStatus, to: InvitationStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Throws `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: InvitationStatus, to: InvitationStatus): void {
    if (!this.canTransition(from, to)) throw invalidStateTransition();
  },
};
