import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import type { DestinationStream } from "pino";
import { AuditModule } from "./modules/audit/audit.module";
import { ConfigModule } from "./platform/config/config.module";
import type { AppConfig } from "./platform/config/config.schema";
import { CryptoModule } from "./platform/crypto/crypto.module";
import { DatabaseModule } from "./platform/database/database.module";
import { HealthModule } from "./platform/health/health.module";
import { GlobalExceptionFilter } from "./platform/http/exception.filter";
import { OriginGuard } from "./platform/http/origin.guard";
import { LoggingModule } from "./platform/logging/logging.module";
import { MailModule } from "./platform/mail/mail.module";
import { RateLimitModule } from "./platform/rate-limit/rate-limit.module";

export interface AppModuleOptions {
  /** Tests capture logs through this stream. */
  logDestination?: DestinationStream;
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggingModule.forRoot(config, options.logDestination),
        DatabaseModule,
        CryptoModule,
        MailModule,
        RateLimitModule,
        AuditModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        // Global guards run in registration order: CSRF first (R6).
        { provide: APP_GUARD, useClass: OriginGuard },
      ],
    };
  }
}
