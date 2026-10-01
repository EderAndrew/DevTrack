import type { ActivityStatus, PublicationPhase } from "@repo/contracts";
import { invalidStateTransition } from "../../platform/http/errors";

/**
 * Class activity lifecycle (012 data-model.md, FR-004, research P4):
 *   ACTIVE → CLOSED (the teacher closes it: nothing more is saved or submitted);
 *   ACTIVE | CLOSED → CANCELLED (it disappears from the students; submissions are kept).
 * Anything else, e.g. CLOSED → ACTIVE or anything out of CANCELLED, → 409. "Agendada" and
 * "publicada" are phases of an ACTIVE activity by the server clock, never stored.
 */
const TRANSITIONS: Readonly<Record<ActivityStatus, readonly ActivityStatus[]>> = {
  ACTIVE: ["CLOSED", "CANCELLED"],
  CLOSED: ["CANCELLED"],
  CANCELLED: [],
};

export const ActivityStateMachine = {
  canTransition(from: ActivityStatus, to: ActivityStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /**
   * `false` when the activity is already in `to` (no effect, no event), `true` for a valid
   * transition; anything else throws `409 INVALID_STATE_TRANSITION`.
   */
  transition(from: ActivityStatus, to: ActivityStatus): boolean {
    if (from === to) return false;
    if (!this.canTransition(from, to)) throw invalidStateTransition();
    return true;
  },

  /** SCHEDULED before `publishAt`, PUBLISHED from it on; null when not ACTIVE. */
  phase(status: ActivityStatus, publishAt: Date, now: Date): PublicationPhase | null {
    if (status !== "ACTIVE") return null;
    return publishAt.getTime() > now.getTime() ? "SCHEDULED" : "PUBLISHED";
  },

  /** Students see an activity once published and until cancelled (FR-007). */
  isVisibleToStudents(status: ActivityStatus, publishAt: Date, now: Date): boolean {
    return status !== "CANCELLED" && publishAt.getTime() <= now.getTime();
  },

  /** Title, instructions, deadline and late policy change only while ACTIVE (FR-024a). */
  assertEditable(status: ActivityStatus): void {
    if (status !== "ACTIVE") throw invalidStateTransition();
  },
};
