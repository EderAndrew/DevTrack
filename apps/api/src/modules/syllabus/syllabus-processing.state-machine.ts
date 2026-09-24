import { MAX_PROCESSING_ATTEMPTS } from "@repo/contracts";
import type { SyllabusFailureCategory, SyllabusProcessingStatus } from "../../generated/prisma/client";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Processing of a syllabus document (004 data-model.md, research E7):
 *   UPLOADED → PROCESSING (claimed by the worker);
 *   PROCESSING → PROCESSED | UPLOADED (transient failure, attempts left) | FAILED;
 *   PROCESSING → PROCESSING (lease expired, claimed again);
 *   FAILED → UPLOADED ("Tentar novamente", attempts reset). PROCESSED is final.
 */
const TRANSITIONS: Readonly<Record<SyllabusProcessingStatus, readonly SyllabusProcessingStatus[]>> = {
  UPLOADED: ["PROCESSING"],
  PROCESSING: ["PROCESSED", "UPLOADED", "FAILED", "PROCESSING"],
  PROCESSED: [],
  FAILED: ["UPLOADED"],
};

/** Waits before the 2nd and 3rd attempts after a transient failure: 1 min, then 5 min. */
const RETRY_DELAYS_SECONDS = [60, 300] as const;

export type FailureOutcome =
  | { to: "UPLOADED"; retryInSeconds: number }
  | { to: "FAILED"; retryInSeconds: null };

export const SyllabusProcessingStateMachine = {
  canTransition(from: SyllabusProcessingStatus, to: SyllabusProcessingStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Throws `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: SyllabusProcessingStatus, to: SyllabusProcessingStatus): void {
    if (!this.canTransition(from, to)) throw invalidStateTransition();
  },

  /**
   * Where a failed attempt leads (004/FR-015). An unreadable file fails at once; a timeout or
   * internal error is retried until `MAX_PROCESSING_ATTEMPTS` attempts were made.
   * `attempts` counts the attempt that just failed.
   */
  afterFailure(category: SyllabusFailureCategory, attempts: number): FailureOutcome {
    if (category === "UNREADABLE" || attempts >= MAX_PROCESSING_ATTEMPTS) return { to: "FAILED", retryInSeconds: null };
    const delay = RETRY_DELAYS_SECONDS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_SECONDS.length) - 1]!;
    return { to: "UPLOADED", retryInSeconds: delay };
  },
};
