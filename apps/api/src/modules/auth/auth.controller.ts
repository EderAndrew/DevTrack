import { Controller, HttpCode, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { emailSchema, passwordInputSchema, tokenSchema } from "../../platform/http/schemas";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { AllowUnverified, Public } from "../access-control/decorators";
import { LoginService } from "./login.service";
import type { MeView } from "./me.service";
import { PasswordResetService } from "./password-reset.service";
import { SessionCookie } from "./session-cookie";
import { SessionEndService } from "./session-end.service";

const loginSchema = z.strictObject({ email: emailSchema, password: passwordInputSchema });
const resetRequestSchema = z.strictObject({ email: emailSchema });
const resetConfirmSchema = z.strictObject({ token: tokenSchema, password: passwordInputSchema });

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
    @ZodBody(loginSchema) body: z.output<typeof loginSchema>,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: MeView }> {
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
  requestPasswordReset(@ZodBody(resetRequestSchema) body: z.output<typeof resetRequestSchema>, @Ctx() ctx: RequestContext) {
    return this.passwordReset.request(body.email, ctx);
  }

  /** Does not sign in: the user logs in with the new password afterwards. */
  @Post("password-reset/confirm")
  @Public()
  @HttpCode(200)
  confirmPasswordReset(@ZodBody(resetConfirmSchema) body: z.output<typeof resetConfirmSchema>, @Ctx() ctx: RequestContext) {
    return this.passwordReset.confirm(body.token, body.password, ctx);
  }
}
