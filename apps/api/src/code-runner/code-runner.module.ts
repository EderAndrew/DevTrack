import { type DynamicModule, Module } from "@nestjs/common";
import type { DestinationStream } from "pino";
import { AuditModule } from "../modules/audit/audit.module";
import { ClockModule } from "../platform/clock/clock";
import { ConfigModule } from "../platform/config/config.module";
import type { AppConfig } from "../platform/config/config.schema";
import { DatabaseModule } from "../platform/database/database.module";
import { LoggingModule } from "../platform/logging/logging.module";

/**
 * The Code Runner worker's application context (019 research B2): configuration, Prisma, the clock,
 * audit and logs — no HTTP, no guards, no domain module. Built only by `main.ts`; the API's
 * `AppModule` never imports it (`code-runner-boundary.spec.ts`).
 */
@Module({})
export class CodeRunnerModule {
  static forRoot(config: AppConfig, options: { logDestination?: DestinationStream } = {}): DynamicModule {
    return {
      module: CodeRunnerModule,
      imports: [ConfigModule.forRoot(config), LoggingModule.forRoot(config, options.logDestination), DatabaseModule, ClockModule, AuditModule],
    };
  }
}
