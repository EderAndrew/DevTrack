import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { HelpAvailability as Availability } from "@repo/contracts";
import { HelpAvailability } from "../activities/help-availability";
import { AiExecutionsService } from "../ai/execution/ai-executions.service";
import { WORK_HELPER_KEY } from "./definitions/work-helper";

/**
 * Whether a work can be applied with the AI help now (015/FR-004, research F3): the `work-helper`
 * ACTIVE and a model the policy can choose for its task. A paused worker (the global kill switch)
 * still takes requests, which wait in the queue as in 011, so it counts as available. Registered on
 * the `HelpAvailability` hook of `activities` at startup, which never imports this module.
 */
@Injectable()
export class WorkHelpAvailability implements OnModuleInit {
  constructor(
    private readonly executions: AiExecutionsService,
    private readonly hook: HelpAvailability,
  ) {}

  onModuleInit(): void {
    this.hook.register(() => this.check());
  }

  async check(): Promise<Availability> {
    const availability = await this.executions.availability(WORK_HELPER_KEY);
    if (availability === "AGENT_DISABLED" || availability === "MODEL_UNAVAILABLE") return { available: false, reason: availability };
    return { available: true, reason: null };
  }
}
