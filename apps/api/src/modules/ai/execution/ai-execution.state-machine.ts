import { AI_FINAL_EXECUTION_STATUSES, type AiExecutionStatus } from "@repo/contracts";
import { invalidStateTransition } from "../../../platform/http/errors";

/**
 * Execution lifecycle (006 data-model.md, FR-021, research A8):
 *   QUEUED → RUNNING ⇄ WAITING_TOOL; RUNNING → VALIDATING_OUTPUT → COMPLETED;
 *   any non-final → CANCELLED | TIMED_OUT; RUNNING | WAITING_TOOL | VALIDATING_OUTPUT → FAILED.
 */
const TRANSITIONS: Readonly<Record<AiExecutionStatus, readonly AiExecutionStatus[]>> = {
  QUEUED: ["RUNNING", "CANCELLED", "TIMED_OUT"],
  RUNNING: ["WAITING_TOOL", "VALIDATING_OUTPUT", "FAILED", "CANCELLED", "TIMED_OUT"],
  WAITING_TOOL: ["RUNNING", "FAILED", "CANCELLED", "TIMED_OUT"],
  VALIDATING_OUTPUT: ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  TIMED_OUT: [],
};

export const AiExecutionStateMachine = {
  canTransition(from: AiExecutionStatus, to: AiExecutionStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Throws `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: AiExecutionStatus, to: AiExecutionStatus): void {
    if (!this.canTransition(from, to)) throw invalidStateTransition();
  },

  isFinal(status: AiExecutionStatus): boolean {
    return (AI_FINAL_EXECUTION_STATUSES as readonly AiExecutionStatus[]).includes(status);
  },
};
