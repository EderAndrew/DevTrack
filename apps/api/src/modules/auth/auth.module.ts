import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { EmailVerificationService } from "./email-verification.service";
import { defaultLoginDelay, LOGIN_DELAY, LoginService } from "./login.service";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { OwnSessionsController } from "./own-sessions.controller";
import { OwnSessionsService } from "./own-sessions.service";
import { PasswordResetService } from "./password-reset.service";
import { PublicRateLimit } from "./public-rate-limit";
import { SessionEndService } from "./session-end.service";
import { SessionService } from "./session.service";
import { SignupController } from "./signup.controller";
import { SignupService } from "./signup.service";
import { UserTokenService } from "./user-token.service";

/**
 * Imported (and re-exported) by the global AccessControlModule; RoleRepository and
 * PermissionResolver come from there, identity/audit/mail/rate limit from global modules.
 */
@Module({
  controllers: [SignupController, AuthController, MeController, OwnSessionsController],
  providers: [
    SessionService,
    UserTokenService,
    PublicRateLimit,
    SignupService,
    EmailVerificationService,
    MeService,
    { provide: LOGIN_DELAY, useValue: defaultLoginDelay },
    LoginService,
    SessionEndService,
    OwnSessionsService,
    PasswordResetService,
  ],
  exports: [SessionService, UserTokenService, PublicRateLimit],
})
export class AuthModule {}
