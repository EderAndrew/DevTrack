import { Controller, Get, Inject } from "@nestjs/common";
import type { CodeRunnerAvailability } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { RequirePermissions } from "../access-control/decorators";
import { RunnerAvailability } from "./availability";

/**
 * 021/US2-6 (research Y3): whether "Executar" would work right now, for the teacher applying a work —
 * the kill switch on and a fresh heartbeat with at least one profile. Only a notice: applying with the
 * option never asks it.
 */
@Controller("code-runner/availability")
export class CodeRunnerAvailabilityController {
  constructor(
    private readonly runner: RunnerAvailability,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @RequirePermissions("atividades.aplicar")
  async get(): Promise<CodeRunnerAvailability> {
    const state = await this.runner.state(this.clock.now());
    return { available: state.enabled && state.profiles.size > 0 };
  }
}
