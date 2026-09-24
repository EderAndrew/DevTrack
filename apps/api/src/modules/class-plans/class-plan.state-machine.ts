import type { PlanStatusAction } from "@repo/contracts";
import type { ClassPlanStatus } from "../../generated/prisma/client";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Class plan lifecycle (004 data-model.md, FR-031, FR-039):
 *   DRAFT → READY (confirm);  READY → DRAFT (reopen);  READY → ACTIVE (start);
 *   DRAFT | READY | ACTIVE → ARCHIVED (final).
 * The rules around a transition (at least one topic to confirm, DRAFT topics becoming ACTIVE)
 * belong to the service.
 */
const TRANSITIONS: Readonly<Record<ClassPlanStatus, readonly ClassPlanStatus[]>> = {
  DRAFT: ["READY", "ARCHIVED"],
  READY: ["DRAFT", "ACTIVE", "ARCHIVED"],
  ACTIVE: ["ARCHIVED"],
  ARCHIVED: [],
};

const TARGET: Readonly<Record<PlanStatusAction, ClassPlanStatus>> = {
  CONFIRM: "READY",
  REOPEN: "DRAFT",
  START: "ACTIVE",
  ARCHIVE: "ARCHIVED",
};

export const ClassPlanStateMachine = {
  canTransition(from: ClassPlanStatus, to: ClassPlanStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /**
   * The status `action` leads to from `from`, or `null` when the plan is already there (repeating
   * an applied action has no effect). Any other transition throws `409 INVALID_STATE_TRANSITION`.
   */
  apply(from: ClassPlanStatus, action: PlanStatusAction): ClassPlanStatus | null {
    const to = TARGET[action];
    if (from === to) return null;
    if (!this.canTransition(from, to)) throw invalidStateTransition();
    return to;
  },
};
