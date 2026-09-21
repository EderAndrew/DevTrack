import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../maintenance/maintenance.service";
import { RateLimitService } from "./rate-limit.service";

/** Removes expired `rate_limit_counters` (R8). Not audited. */
@Injectable()
export class RateLimitCountersJob implements MaintenanceJob, OnModuleInit {
  readonly name = "rate-limit-counters";

  constructor(
    private readonly rateLimit: RateLimitService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  run({ batchSize }: MaintenanceJobContext): Promise<number> {
    return deleteInBatches(batchSize, () => this.rateLimit.cleanupExpired(batchSize));
  }
}
