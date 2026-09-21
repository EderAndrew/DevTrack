import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import type { DestinationStream } from "pino";
import { AccountsModule } from "./modules/accounts/accounts.module";
import { AdminBootstrapModule } from "./modules/admin-bootstrap/admin-bootstrap.module";
import { AccessControlModule } from "./modules/access-control/access-control.module";
import { PermissionsGuard } from "./modules/access-control/guards/permissions.guard";
import { SessionGuard } from "./modules/access-control/guards/session.guard";
import { VerifiedGuard } from "./modules/access-control/guards/verified.guard";
import { AuditModule } from "./modules/audit/audit.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { ProvisioningModule } from "./modules/provisioning/provisioning.module";
import { RetentionModule } from "./modules/retention/retention.module";
import { ConfigModule } from "./platform/config/config.module";
import type { AppConfig } from "./platform/config/config.schema";
import { CryptoModule } from "./platform/crypto/crypto.module";
import { DatabaseModule } from "./platform/database/database.module";
import { HealthModule } from "./platform/health/health.module";
import { GlobalExceptionFilter } from "./platform/http/exception.filter";
import { OriginGuard } from "./platform/http/origin.guard";
import { LoggingModule } from "./platform/logging/logging.module";
import { MailModule } from "./platform/mail/mail.module";
import type { Mailer } from "./platform/mail/mailer";
import { MaintenanceModule } from "./platform/maintenance/maintenance.module";
import { RateLimitModule } from "./platform/rate-limit/rate-limit.module";

export interface AppModuleOptions {
  /** Tests capture logs through this stream. */
  logDestination?: DestinationStream;
  /** Replaces the SMTP mailer (CLI tests). */
  mailer?: Mailer;
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
        MailModule.forRoot(options.mailer),
        MaintenanceModule,
        RateLimitModule,
        AuditModule,
        IdentityModule,
        AccessControlModule,
        ProvisioningModule,
        AdminBootstrapModule,
        AccountsModule,
        RetentionModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        // Global guards run in registration order (R6, R9):
        // CSRF → session (401) → verified e-mail (403) → permissions (403).
        { provide: APP_GUARD, useClass: OriginGuard },
        { provide: APP_GUARD, useExisting: SessionGuard },
        { provide: APP_GUARD, useExisting: VerifiedGuard },
        { provide: APP_GUARD, useExisting: PermissionsGuard },
      ],
    };
  }
}
