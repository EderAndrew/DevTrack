import { Module } from "@nestjs/common";
import { EmailVerificationService } from "./email-verification.service";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { PublicRateLimit } from "./public-rate-limit";
import { SessionService } from "./session.service";
import { SignupController } from "./signup.controller";
import { SignupService } from "./signup.service";
import { UserTokenService } from "./user-token.service";

/**
 * Imported (and re-exported) by the global AccessControlModule; RoleRepository and
 * PermissionResolver come from there, identity/audit/mail/rate limit from global modules.
 */
@Module({
  controllers: [SignupController, MeController],
  providers: [SessionService, UserTokenService, PublicRateLimit, SignupService, EmailVerificationService, MeService],
  exports: [SessionService, UserTokenService],
})
export class AuthModule {}
