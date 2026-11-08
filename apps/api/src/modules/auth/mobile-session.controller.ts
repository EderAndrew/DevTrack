import { Controller, Delete, HttpCode, Post } from "@nestjs/common";
import { type MobileLoginRequest, MobileLoginRequestSchema, type MobileSession } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { AllowUnverified, MobileAccess, MobileEntry, Public } from "../access-control/decorators";
import { MobileSessionService } from "./mobile-session.service";

/** 024/US1: the app's session (contracts/http-api.md). No cookie is ever set or read here. */
@Controller("auth/mobile/sessions")
export class MobileSessionController {
  constructor(private readonly mobileSessions: MobileSessionService) {}

  /** No Origin needed (a native client), JSON only (research Y4); the secret appears only in this answer. */
  @Post()
  @Public()
  @MobileEntry()
  @HttpCode(201)
  signIn(@ZodBody(MobileLoginRequestSchema) body: MobileLoginRequest, @Ctx() ctx: RequestContext): Promise<MobileSession> {
    return this.mobileSessions.signIn(body, ctx);
  }

  /** Always allowed to the session itself, like the web's logout. */
  @Delete("current")
  @AllowUnverified()
  @MobileAccess()
  @HttpCode(204)
  signOut(@Ctx() ctx: RequestContext): Promise<void> {
    return this.mobileSessions.signOut(ctx.auth!, ctx.requestId);
  }
}
