import { Controller, HttpCode, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { emailSchema, passwordInputSchema } from "../../platform/http/schemas";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { AllowUnverified, Public } from "../access-control/decorators";
import { LoginService } from "./login.service";
import type { MeView } from "./me.service";
import { SessionCookie } from "./session-cookie";
import { SessionEndService } from "./session-end.service";

const loginSchema = z.strictObject({ email: emailSchema, password: passwordInputSchema });

/** The response object is used only to set or clear the session cookie. */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly logins: LoginService,
    private readonly sessionEnd: SessionEndService,
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
}
