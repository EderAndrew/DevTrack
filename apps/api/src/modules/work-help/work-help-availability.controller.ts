import { Controller, Get } from "@nestjs/common";
import type { HelpAvailability } from "@repo/contracts";
import { RequirePermissions } from "../access-control/decorators";
import { WorkHelpAvailability } from "./work-help-availability";

/** "Ajuda da IA" on the teacher's apply and edit forms (015 contracts/http-api.md, research F3). */
@Controller("work-help")
export class WorkHelpAvailabilityController {
  constructor(private readonly availability: WorkHelpAvailability) {}

  @Get("availability")
  @RequirePermissions("atividades.aplicar")
  get(): Promise<HelpAvailability> {
    return this.availability.check();
  }
}
