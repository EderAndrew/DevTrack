import type { CodeRunFailureReason, CodeRunStatus } from "@repo/contracts";

// The state machine of a run (019 data-model.md, research B8). The database enforces the same
// transitions by trigger; this is what the API and the worker decide with.

const TRANSITIONS: Readonly<Record<CodeRunStatus, readonly CodeRunStatus[]>> = {
  QUEUED: ["RUNNING", "FAILED"],
  RUNNING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

export const canTransition = (from: CodeRunStatus, to: CodeRunStatus): boolean => TRANSITIONS[from].includes(to);

export const isFinal = (status: CodeRunStatus): boolean => TRANSITIONS[status].length === 0;

/**
 * Why a pending run is stale at `now` (the caller's server clock): QUEUED past its queue deadline
 * → EXPIRED; RUNNING past its lease (the worker died) → INTERRUPTED. Null when it isn't.
 */
export function staleReason(
  run: { status: CodeRunStatus; deadlineAt: Date; leaseUntil: Date | null },
  now: Date,
): Extract<CodeRunFailureReason, "EXPIRED" | "INTERRUPTED"> | null {
  if (run.status === "QUEUED" && run.deadlineAt.getTime() <= now.getTime()) return "EXPIRED";
  if (run.status === "RUNNING" && run.leaseUntil !== null && run.leaseUntil.getTime() <= now.getTime()) return "INTERRUPTED";
  return null;
}
