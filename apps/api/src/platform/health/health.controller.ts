import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../../modules/access-control/decorators";
import { HealthService } from "./health.service";

type HealthStatus = { status: "ok" } | { status: "unavailable" };

/** Liveness and readiness probes (R19). Responses never include internal details. */
@Controller("health")
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("live")
  live(): HealthStatus {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    if (await this.health.isDatabaseReady()) return { status: "ok" };
    res.status(503);
    return { status: "unavailable" };
  }
}
