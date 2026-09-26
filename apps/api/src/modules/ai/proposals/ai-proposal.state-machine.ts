import type { AiProposalStatus } from "@repo/contracts";
import { invalidStateTransition } from "../../../platform/http/errors";

/**
 * Proposal lifecycle (006 data-model.md, FR-042): only READY_FOR_REVIEW is decided or expires;
 * every other status is final.
 */
const TRANSITIONS: Readonly<Record<AiProposalStatus, readonly AiProposalStatus[]>> = {
  READY_FOR_REVIEW: ["APPROVED", "PARTIALLY_APPROVED", "REJECTED", "EXPIRED"],
  APPROVED: [],
  PARTIALLY_APPROVED: [],
  REJECTED: [],
  EXPIRED: [],
};

export const AiProposalStateMachine = {
  canTransition(from: AiProposalStatus, to: AiProposalStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Throws `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: AiProposalStatus, to: AiProposalStatus): void {
    if (!this.canTransition(from, to)) throw invalidStateTransition();
  },
};
