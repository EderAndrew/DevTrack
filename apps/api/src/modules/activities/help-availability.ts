import { Injectable } from "@nestjs/common";
import type { HelpAvailability as Availability } from "@repo/contracts";

/** Whether the AI help can be turned on now: the agent and a model for its task (015 FR-004). */
export type HelpAvailabilityCheck = () => Promise<Availability>;

/** Without the AI help module, there is no agent to help. */
const UNAVAILABLE: Availability = { available: false, reason: "AGENT_DISABLED" };

/**
 * The activities' extension point for the AI help (015 research F1, like the 011 `WorkReview`):
 * applying or editing a work with an allowance of 3 asks it, and `work-help`, which `activities`
 * never imports, registers the check at startup. Without a registration the help is unavailable.
 */
@Injectable()
export class HelpAvailability {
  private checkFn: HelpAvailabilityCheck | null = null;

  register(check: HelpAvailabilityCheck): void {
    this.checkFn = check;
  }

  check(): Promise<Availability> {
    return this.checkFn ? this.checkFn() : Promise.resolve(UNAVAILABLE);
  }
}
