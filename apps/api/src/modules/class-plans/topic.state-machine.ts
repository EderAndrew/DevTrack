import type { ClassPlanStatus, TopicStatus } from "../../generated/prisma/client";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Topic lifecycle (004 data-model.md, FR-038, FR-056 – FR-058):
 *   DRAFT → ACTIVE (the plan is confirmed);
 *   ACTIVE ⇄ COMPLETED ("Concluir aula" / "Reabrir aula");
 *   DRAFT | ACTIVE | COMPLETED → ARCHIVED (archive, merge or "remove"; a COMPLETED topic is only archived);
 *   ARCHIVED → DRAFT | ACTIVE (restore, never after COMPLETED). Topics are never deleted.
 */
const TRANSITIONS: Readonly<Record<TopicStatus, readonly TopicStatus[]>> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["COMPLETED", "ARCHIVED"],
  COMPLETED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["DRAFT", "ACTIVE"],
};

export const TopicStateMachine = {
  canTransition(from: TopicStatus, to: TopicStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /**
   * `false` when the topic is already in `to` (no effect), `true` for a valid transition;
   * anything else throws `409 INVALID_STATE_TRANSITION`.
   */
  transition(from: TopicStatus, to: TopicStatus): boolean {
    if (from === to) return false;
    if (!this.canTransition(from, to)) throw invalidStateTransition();
    return true;
  },

  /** Status of a new topic: DRAFT while the plan is a draft, ACTIVE once it is READY or ACTIVE. */
  initialStatus(planStatus: Exclude<ClassPlanStatus, "ARCHIVED">): TopicStatus {
    return planStatus === "DRAFT" ? "DRAFT" : "ACTIVE";
  },

  /** A topic archived after it was completed stays archived (FR-058). */
  canRestore(statusBeforeArchive: TopicStatus | null): boolean {
    return statusBeforeArchive !== "COMPLETED";
  },

  /**
   * Status of a restored topic: ACTIVE when the plan is already READY or ACTIVE, otherwise the
   * status it had before being archived (ACTIVE if unknown).
   */
  restoredStatus(statusBeforeArchive: TopicStatus | null, planStatus: Exclude<ClassPlanStatus, "ARCHIVED">): TopicStatus {
    if (planStatus !== "DRAFT") return "ACTIVE";
    return statusBeforeArchive === "DRAFT" ? "DRAFT" : "ACTIVE";
  },
};
