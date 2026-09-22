import { Controller, HttpCode, Post, Res } from "@nestjs/common";
import {
  type LoginRequest,
  LoginRequestSchema,
  type LoginResponse,
  type MessageResponse,
  type PasswordResetConfirmRequest,
  PasswordResetConfirmRequestSchema,
  type PasswordResetRequest,
  PasswordResetRequestSchema,
  type PublicAccepted,
} from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { AllowUnverified, Public } from "../access-control/decorators";
import { LoginService } from "./login.service";
import { PasswordResetService } from "./password-reset.service";
import { SessionCookie } from "./session-cookie";
import { SessionEndService } from "./session-end.service";

/** The response object is used only to set or clear the session cookie. */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly logins: LoginService,
    private readonly sessionEnd: SessionEndService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post("login")
  @Public()
  @HttpCode(200)
  async login(
    @ZodBody(LoginRequestSchema) body: LoginRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { secret, absoluteExpiresAt, user } = await this.logins.login(body, ctx);
    SessionCookie.set(res, secret, absoluteExpiresAt);
    return { user };
  }

  /** Allowed before verification (FR-016). */
  @Post("logout")
  @AllowUnverified()
  @HttpCode(204)
  async logout(@Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessionEnd.logout(ctx.auth!, ctx.requestId);
    SessionCookie.clear(res);
  }

  @Post("logout-all")
  @AllowUnverified()
  @HttpCode(204)
  async logoutAll(@Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessionEnd.logoutAll(ctx.auth!, ctx.requestId);
    SessionCookie.clear(res);
  }

  /** Same answer whether or not the e-mail has an account (FR-029a). */
  @Post("password-reset/request")
  @Public()
  @HttpCode(202)
  requestPasswordReset(
    @ZodBody(PasswordResetRequestSchema) body: PasswordResetRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<PublicAccepted> {
    return this.passwordReset.request(body.email, ctx);
  }

  /** Does not sign in: the user logs in with the new password afterwards. */
  @Post("password-reset/confirm")
  @Public()
  @HttpCode(200)
  confirmPasswordReset(
    @ZodBody(PasswordResetConfirmRequestSchema) body: PasswordResetConfirmRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<MessageResponse> {
    return this.passwordReset.confirm(body.token, body.password, ctx);
  }
}
