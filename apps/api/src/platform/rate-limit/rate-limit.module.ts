import { Global, Module } from "@nestjs/common";
import { RateLimitCountersJob } from "./rate-limit-counters.job";
import { RateLimitService } from "./rate-limit.service";

@Global()
@Module({ providers: [RateLimitService, RateLimitCountersJob], exports: [RateLimitService] })
export class RateLimitModule {}
