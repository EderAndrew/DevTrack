import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermissionsGuard } from "./guards/permissions.guard";
import { SessionGuard } from "./guards/session.guard";
import { VerifiedGuard } from "./guards/verified.guard";
import { PermissionResolver } from "./permission-resolver";
import { RoleLifecycleService } from "./role-lifecycle.service";
import { RoleRepository } from "./role.repository";

/** The guards are registered as APP_GUARD by AppModule, which fixes their order. */
@Global()
@Module({
  imports: [AuthModule],
  providers: [PermissionResolver, RoleRepository, RoleLifecycleService, SessionGuard, VerifiedGuard, PermissionsGuard],
  exports: [
    AuthModule,
    PermissionResolver,
    RoleRepository,
    RoleLifecycleService,
    SessionGuard,
    VerifiedGuard,
    PermissionsGuard,
  ],
})
export class AccessControlModule {}
