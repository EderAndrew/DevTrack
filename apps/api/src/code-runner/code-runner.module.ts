import { type DynamicModule, Module } from "@nestjs/common";
import type { DestinationStream } from "pino";
import { AuditModule } from "../modules/audit/audit.module";
import { ClockModule } from "../platform/clock/clock";
import { ConfigModule } from "../platform/config/config.module";
import type { AppConfig } from "../platform/config/config.schema";
import { DatabaseModule } from "../platform/database/database.module";
import { LoggingModule } from "../platform/logging/logging.module";
import { CodeRunnerHeartbeat } from "./heartbeat";
import type { SandboxPort } from "./sandbox/sandbox.port";
import { SANDBOX, WORKER_ID } from "./tokens";
import { CodeRunWorker } from "./worker";

/**
 * The Code Runner worker's application context (019 research B2): configuration, Prisma, the clock,
 * audit and logs, the heartbeat and the claim loop over a `SandboxPort` — no HTTP, no guards, no
 * domain module. Built only by `main.ts`; the API's `AppModule` never imports it
 * (`code-runner-boundary.spec.ts`).
 */
@Module({})
export class CodeRunnerModule {
  static forRoot(config: AppConfig, options: { sandbox: SandboxPort; workerId: string; logDestination?: DestinationStream }): DynamicModule {
    return {
      module: CodeRunnerModule,
      imports: [ConfigModule.forRoot(config), LoggingModule.forRoot(config, options.logDestination), DatabaseModule, ClockModule, AuditModule],
      providers: [
        { provide: SANDBOX, useValue: options.sandbox },
        { provide: WORKER_ID, useValue: options.workerId },
        CodeRunnerHeartbeat,
        CodeRunWorker,
      ],
    };
  }
}
